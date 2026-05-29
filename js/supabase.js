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
    profileRes, eventsRes, goalsRes, goalLogsRes,
    projectsRes, projectTasksRes,
    incomeRes, spendingRes, debtsRes, notesRes
  ] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
    sb.from('schedule_events').select('*').eq('user_id', userId),
    sb.from('goals').select('*').eq('user_id', userId).order('created_at'),
    sb.from('goal_logs').select('*').eq('user_id', userId),
    sb.from('projects').select('*').eq('user_id', userId).order('created_at'),
    sb.from('project_tasks').select('*').eq('user_id', userId).order('created_at'),
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
  state.goals.dos   = (goalsRes.data || []).filter(g => g.type === 'do').map(g => ({ id: g.id, text: g.text }));
  state.goals.donts = (goalsRes.data || []).filter(g => g.type === 'dont').map(g => ({ id: g.id, text: g.text }));
  state.goalLogs    = (goalLogsRes.data || []).map(l => ({ id: l.id, goal_id: l.goal_id, user_id: l.user_id, date: l.date, checked: l.checked }));

  // Projects
  const allProjectTasks = projectTasksRes.data || [];
  state.projects = (projectsRes.data || []).map(p => {
    const tasks = allProjectTasks.filter(t => t.project_id === p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description || '',
      status: p.status,
      deadline: p.deadline,
      tasks: tasks.map(t => ({ id: t.id, text: t.text, description: t.description || '', checked: t.checked }))
    };
  });

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
    ...def.goals.dos.map(g => ({ user_id: userId, type: 'do', text: g.text })),
    ...def.goals.donts.map(g => ({ user_id: userId, type: 'dont', text: g.text }))
  ];
  const { data: goalData } = await sb.from('goals').insert(goalRows).select();
  state.goals.dos   = (goalData || []).filter(g => g.type === 'do').map(g => ({ id: g.id, text: g.text }));
  state.goals.donts = (goalData || []).filter(g => g.type === 'dont').map(g => ({ id: g.id, text: g.text }));

  // Goal logs — seed today's checked state from defaultState
  const today = todayISO();
  const defDos   = def.goals.dos;
  const defDonts = def.goals.donts;
  const goalLogRows = [];
  (goalData || []).forEach(g => {
    const defList = g.type === 'do' ? defDos : defDonts;
    const defGoal = defList.find(d => d.text === g.text);
    if (defGoal && defGoal.done) goalLogRows.push({ user_id: userId, goal_id: g.id, date: today, checked: true });
  });
  const { data: glData } = goalLogRows.length
    ? await sb.from('goal_logs').insert(goalLogRows).select()
    : { data: [] };
  state.goalLogs = (glData || []).map(l => ({ id: l.id, goal_id: l.goal_id, user_id: l.user_id, date: l.date, checked: l.checked }));

  // Projects
  const now = new Date().toISOString();
  const projectRows = def.projects.map(p => ({ user_id: userId, name: p.name, description: p.description || null, status: p.status, deadline: p.deadline || null, updated_at: now }));
  const { data: projData } = await sb.from('projects').insert(projectRows).select();
  const projTaskRows = [];
  (projData || []).forEach((p, i) => {
    const defP = def.projects[i];
    (defP.tasks || []).forEach(t => {
      projTaskRows.push({ user_id: userId, project_id: p.id, text: t.text, description: t.description || null, checked: t.checked });
    });
  });
  const { data: projTaskData } = projTaskRows.length ? await sb.from('project_tasks').insert(projTaskRows).select() : { data: [] };
  state.projects = (projData || []).map((p, i) => {
    const tasks = (projTaskData || []).filter(t => t.project_id === p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description || '',
      status: p.status,
      deadline: p.deadline,
      tasks: tasks.map(t => ({ id: t.id, text: t.text, description: t.description || '', checked: t.checked }))
    };
  });

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
  document.getElementById('app-loading').classList.add('hidden');
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
