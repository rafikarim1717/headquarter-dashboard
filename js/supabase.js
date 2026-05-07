/* =========================================================
   SUPABASE INIT
========================================================= */
const { createClient } = supabase;
const sb = createClient(
  'https://ffleqouktwanayuidyaf.supabase.co',
  'sb_publishable_KK8iJpsgP43BHseBg6SNsA_cCBL2C4R'
);

/* =========================================================
   DB HELPER — retry once on failure
========================================================= */
async function dbCall(fn) {
  try {
    const result = await fn();
    if (result.error) throw result.error;
    return result;
  } catch (e) {
    showToast('Sync failed, retrying...');
    await new Promise(r => setTimeout(r, 1500));
    try {
      const result = await fn();
      if (result.error) throw result.error;
      return result;
    } catch (e2) {
      showToast('Sync failed. Check connection.');
      throw e2;
    }
  }
}

/* =========================================================
   LOAD DATA FROM SUPABASE → state
========================================================= */
async function loadFromSupabase(userId) {
  const [
    profileRes, eventsRes, goalsRes, habitsRes,
    habitLogsRes, focusBoardRes, focusTasksRes,
    incomeRes, spendingRes, debtsRes, notesRes
  ] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
    sb.from('schedule_events').select('*').eq('user_id', userId),
    sb.from('goals').select('*').eq('user_id', userId).order('created_at'),
    sb.from('habits').select('*').eq('user_id', userId).order('created_at'),
    sb.from('habit_logs').select('*').eq('user_id', userId),
    sb.from('focus_board').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('focus_tasks').select('*').eq('user_id', userId).order('created_at'),
    sb.from('income_entries').select('*').eq('user_id', userId).order('date', { ascending: false }),
    sb.from('spending_entries').select('*').eq('user_id', userId).order('date', { ascending: false }),
    sb.from('debts').select('*').eq('user_id', userId).order('due_date'),
    sb.from('notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
  ]);

  const isNewUser = !profileRes.data;

  if (isNewUser) {
    await seedSampleData(userId);
    return;
  }

  // Profile — auth metadata takes priority over DB value
  state.profile.name = displayNameFromUser(currentUser) || profileRes.data?.name || 'Friend';
  window.__HQ_TWEAKS.name = state.profile.name;

  // Schedule: group events by date
  state.schedule = {};
  (eventsRes.data || []).forEach(e => {
    const d = e.date;
    if (!state.schedule[d]) state.schedule[d] = [];
    state.schedule[d].push({ id: e.id, time: e.time, title: e.title, sub: e.note || '', alarm_time: e.alarm_time || null });
  });

  // Goals
  state.goals.dos   = (goalsRes.data || []).filter(g => g.type === 'do').map(g => ({ id: g.id, text: g.text, done: g.checked }));
  state.goals.donts = (goalsRes.data || []).filter(g => g.type === 'dont').map(g => ({ id: g.id, text: g.text, done: g.checked }));

  // Habits + logs
  const allLogs = habitLogsRes.data || [];
  const today = todayISO();
  state.habits = (habitsRes.data || []).map(h => {
    const hLogs = allLogs.filter(l => l.habit_id === h.id);
    const doneToday = hLogs.some(l => l.date === today && l.checked);
    const log = compute7DayLog(hLogs);
    return { id: h.id, name: h.name, streak: h.streak || 0, doneToday, log };
  });

  // Focus board
  if (focusBoardRes.data) {
    focusBoardId = focusBoardRes.data.id;
    state.focus.main = focusBoardRes.data.main_focus || '';
    state.focus.tasks = (focusTasksRes.data || []).map(t => ({ id: t.id, text: t.text, done: t.checked, description: t.description || '' }));
  } else {
    // Create empty focus board for user
    const { data: fb } = await sb.from('focus_board').insert({ user_id: userId, main_focus: '' }).select().single();
    if (fb) focusBoardId = fb.id;
    state.focus = { main: '', tasks: [] };
  }

  // Finance
  state.income   = (incomeRes.data   || []).map(i => ({ id: i.id, date: i.date, source: i.source, amount: Number(i.amount) }));
  state.spending = (spendingRes.data  || []).map(s => ({ id: s.id, date: s.date, time: s.time, cat: s.category, note: s.note, amount: Number(s.amount) }));
  state.debts    = (debtsRes.data     || []).map(d => ({ id: d.id, creditor: d.creditor, amount: Number(d.amount), due: d.due_date, paid: d.paid }));

  // Notes
  state.notes = (notesRes.data || []).map(n => ({ id: n.id, title: n.title || '', content: n.content || '', created_at: n.created_at, updated_at: n.updated_at }));
}

function compute7DayLog(logs) {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = isoLocal(d);
    result.push(logs.some(l => l.date === iso && l.checked) ? 1 : 0);
  }
  return result;
}

function computeStreak(logs) {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const iso = isoLocal(d);
    if (logs.some(l => l.date === iso && l.checked)) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* =========================================================
   SEED SAMPLE DATA (first login)
========================================================= */
async function seedSampleData(userId) {
  const def = defaultState();

  // Profile
  const realName = displayNameFromUser(currentUser);
  await sb.from('profiles').upsert({ id: userId, name: realName });
  state.profile.name = realName;
  window.__HQ_TWEAKS.name = realName;

  // Schedule events
  const schedRows = [];
  Object.entries(def.schedule).forEach(([date, events]) => {
    events.forEach(e => schedRows.push({ user_id: userId, date, time: e.time, title: e.title, note: e.sub || '' }));
  });
  const { data: schedData } = await sb.from('schedule_events').insert(schedRows).select();
  state.schedule = {};
  (schedData || []).forEach(e => {
    if (!state.schedule[e.date]) state.schedule[e.date] = [];
    state.schedule[e.date].push({ id: e.id, time: e.time, title: e.title, sub: e.note || '', alarm_time: null });
  });

  // Goals
  const goalRows = [
    ...def.goals.dos.map(g => ({ user_id: userId, type: 'do', text: g.text, checked: g.done })),
    ...def.goals.donts.map(g => ({ user_id: userId, type: 'dont', text: g.text, checked: g.done }))
  ];
  const { data: goalData } = await sb.from('goals').insert(goalRows).select();
  state.goals.dos   = (goalData || []).filter(g => g.type === 'do').map(g => ({ id: g.id, text: g.text, done: g.checked }));
  state.goals.donts = (goalData || []).filter(g => g.type === 'dont').map(g => ({ id: g.id, text: g.text, done: g.checked }));

  // Habits + logs
  const habitRows = def.habits.map(h => ({ user_id: userId, name: h.name, streak: h.streak }));
  const { data: habitData } = await sb.from('habits').insert(habitRows).select();
  const today = todayISO();
  const logRows = [];
  (habitData || []).forEach((h, i) => {
    const defH = def.habits[i];
    for (let j = 6; j >= 0; j--) {
      const d = new Date(); d.setDate(d.getDate() - j);
      const iso = isoLocal(d);
      logRows.push({ habit_id: h.id, user_id: userId, date: iso, checked: defH.log[6 - j] === 1 });
    }
  });
  await sb.from('habit_logs').insert(logRows);
  state.habits = (habitData || []).map((h, i) => ({ ...def.habits[i], id: h.id }));

  // Focus board
  const { data: fb } = await sb.from('focus_board').insert({ user_id: userId, main_focus: def.focus.main }).select().single();
  if (fb) {
    focusBoardId = fb.id;
    const taskRows = def.focus.tasks.map(t => ({ focus_id: fb.id, user_id: userId, text: t.text, checked: t.done }));
    const { data: taskData } = await sb.from('focus_tasks').insert(taskRows).select();
    state.focus = { main: def.focus.main, tasks: (taskData || []).map(t => ({ id: t.id, text: t.text, done: t.checked })) };
  }

  // Income
  const incomeRows = def.income.map(i => ({ user_id: userId, date: i.date, source: i.source, amount: i.amount }));
  const { data: incomeData } = await sb.from('income_entries').insert(incomeRows).select();
  state.income = (incomeData || []).map(i => ({ id: i.id, date: i.date, source: i.source, amount: Number(i.amount) }));

  // Spending
  const spendRows = def.spending.map(s => ({ user_id: userId, date: s.date, time: s.time, category: s.cat, note: s.note, amount: s.amount }));
  const { data: spendData } = await sb.from('spending_entries').insert(spendRows).select();
  state.spending = (spendData || []).map(s => ({ id: s.id, date: s.date, time: s.time, cat: s.category, note: s.note, amount: Number(s.amount) }));

  // Debts
  const debtRows = def.debts.map(d => ({ user_id: userId, creditor: d.creditor, amount: d.amount, due_date: d.due, paid: d.paid }));
  const { data: debtData } = await sb.from('debts').insert(debtRows).select();
  state.debts = (debtData || []).map(d => ({ id: d.id, creditor: d.creditor, amount: Number(d.amount), due: d.due_date, paid: d.paid }));
}

/* =========================================================
   AUTH
========================================================= */
function displayNameFromUser(user) {
  const meta = user?.user_metadata || {};
  const raw = meta.full_name || meta.name || (user?.email || '').split('@')[0] || 'Friend';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-loading').classList.add('hidden');
  document.getElementById('app').style.display = '';
  document.getElementById('bottom-nav').style.display = '';
}

async function handleSession(session) {
  if (!session) { showLogin(); return; }
  if (currentUser && currentUser.id === session.user.id) return;
  currentUser = session.user;
  state.profile.name = displayNameFromUser(currentUser);
  window.__HQ_TWEAKS.name = state.profile.name;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-loading').classList.remove('hidden');

  try {
    await loadFromSupabase(currentUser.id);
  } catch (e) {
    console.error('Failed to load data', e);
    showToast('Failed to load data. Please refresh.');
  }

  applyTweaks();
  restoreUIPrefs();
  showApp();
  syncTweaksUI();
  render();
  initGlobalBindings();

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  checkAlarms();
  if (!alarmInterval) {
    alarmInterval = setInterval(checkAlarms, 60000);
  }
}

async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  showLogin();
}

document.getElementById('google-login-btn').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) showToast('Login failed: ' + error.message);
});

// Email / password auth
function loginMsg(text, type) {
  const el = document.getElementById('login-msg');
  el.textContent = text;
  el.className = 'login-msg ' + type;
}
function loginFields() {
  return {
    email: document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-password').value
  };
}

document.getElementById('email-login-btn').addEventListener('click', async () => {
  const { email, password } = loginFields();
  if (!email || !password) { loginMsg('Enter your email and password.', 'error'); return; }
  loginMsg('', '');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) loginMsg(error.message, 'error');
});

document.getElementById('email-signup-btn').addEventListener('click', async () => {
  const { email, password } = loginFields();
  if (!email || !password) { loginMsg('Enter your email and password.', 'error'); return; }
  if (password.length < 6) { loginMsg('Password must be at least 6 characters.', 'error'); return; }
  loginMsg('', '');
  const { error } = await sb.auth.signUp({ email, password });
  if (error) loginMsg(error.message, 'error');
  else loginMsg('Check your email to confirm your account.', 'success');
});

document.getElementById('forgot-password-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { loginMsg('Enter your email address first.', 'error'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
  if (error) loginMsg(error.message, 'error');
  else loginMsg('Password reset email sent — check your inbox.', 'success');
});

let cachedSession = null;

const getSession = async () => {
  if (cachedSession) return cachedSession;
  const { data } = await sb.auth.getSession();
  cachedSession = data.session;
  return cachedSession;
};

sb.auth.onAuthStateChange((_event, session) => {
  cachedSession = session;
  handleSession(session);
});

// Check on load — catches OAuth redirect sessions on mobile
getSession().then(handleSession);

let hiddenAt = null;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
  } else {
    if (!hiddenAt) return;
    const hiddenDuration = Date.now() - hiddenAt;
    hiddenAt = null;
    if (hiddenDuration < 5 * 60 * 1000) return;
    if (!currentUser) return;
    loadFromSupabase(currentUser.id).then(() => { render(); checkAlarms(); }).catch(e => {
      console.error('Failed to refresh data', e);
    });
  }
});
