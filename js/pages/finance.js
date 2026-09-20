/* =========================================================
   Finance — Overview / Income / Spending / Debts
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */

/* ---- FINANCE: OVERVIEW ---- */
function thisMonthIncome() {
  const ym = ymLocal(new Date());
  return state.income.filter(i => (i.date||'').startsWith(ym)).reduce((s,i) => s + Number(i.amount||0), 0);
}
function todaySpend() {
  return state.spending.filter(s => s.date === todayISO()).reduce((s,i) => s + Number(i.amount||0), 0);
}
function thisMonthSpend() {
  const ym = ymLocal(new Date());
  return state.spending.filter(s => (s.date||'').startsWith(ym)).reduce((s,i) => s + Number(i.amount||0), 0);
}
function lastMonthYm() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1);
  return ymLocal(d);
}
function lastMonthNet() {
  const ym = lastMonthYm();
  const inc = state.income.filter(i => (i.date||'').startsWith(ym)).reduce((s,i) => s + Number(i.amount||0), 0);
  const spent = state.spending.filter(s => (s.date||'').startsWith(ym)).reduce((s,i) => s + Number(i.amount||0), 0);
  return inc - spent;
}
function totalDebt() {
  return state.debts.filter(d => !d.paid).reduce((s,d) => s + Number(d.amount||0), 0);
}
function daysUntil(iso) {
  const d = new Date(iso); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function last7DaysSpend() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const iso = isoLocal(d);
    const total = state.spending.filter(s => s.date === iso).reduce((s,x) => s + Number(x.amount||0), 0);
    out.push({
      iso, total,
      isToday: iso === todayISO(),
      label: d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,3),
      dateLabel: d.toLocaleDateString(undefined,{month:'short', day:'numeric'})
    });
  }
  return out;
}

function renderFinanceOverview() {
  const inc = thisMonthIncome(), spent = todaySpend(), debt = totalDebt();
  const spentMonth = thisMonthSpend();
  const net = inc - spentMonth;
  const netDelta = net - lastMonthNet();
  const netDeltaLabel = netDelta === 0 ? 'same as last month' : `${netDelta > 0 ? '+' : '−'}${fmtMoney(Math.abs(netDelta))} vs last month`;
  const unpaidDebts = state.debts.filter(d => !d.paid);
  const overdueDebts = unpaidDebts.filter(d => daysUntil(d.due) < 0);
  const urgentDebts  = unpaidDebts.filter(d => { const n = daysUntil(d.due); return n >= 0 && n <= 7; });
  const alertParts = [];
  if (overdueDebts.length > 0) {
    alertParts.push(`<div class="alert"><span class="glyph">⚠</span> ${overdueDebts.length} debt${overdueDebts.length === 1 ? '' : 's'} overdue</div>`);
  }
  if (urgentDebts.length > 0) {
    const todayDebts  = urgentDebts.filter(d => daysUntil(d.due) === 0);
    const futureDebts = urgentDebts.filter(d => daysUntil(d.due) > 0);
    let urgentMsg;
    if (todayDebts.length === 1) {
      urgentMsg = `Debt due today: ${escapeHtml(todayDebts[0].creditor)}`;
    } else if (todayDebts.length > 1) {
      urgentMsg = `${todayDebts.length} debts due today`;
    } else if (futureDebts.length === 1) {
      const n = daysUntil(futureDebts[0].due);
      urgentMsg = `Debt due in ${n} day${n === 1 ? '' : 's'}: ${escapeHtml(futureDebts[0].creditor)}`;
    } else {
      urgentMsg = `${urgentDebts.length} debts due within 7 days`;
    }
    alertParts.push(`<div class="alert"><span class="glyph">⚠</span> ${urgentMsg}</div>`);
  }
  const alertsHtml = alertParts.length
    ? `<div style="margin-top:18px; display:flex; flex-direction:column; gap:8px;">${alertParts.join('')}</div>`
    : '';
  const days = last7DaysSpend();
  const max = Math.max(1, ...days.map(d=>d.total));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';

  return `
    ${topbar()}
    <h1 class="page-title">Finance</h1>
    <div class="metric-grid">
      <div class="card metric" style="animation-delay:0ms"><div class="label">Income · this month</div><div class="num" data-target="${inc}" data-prefix="${pfx}">${fmtMoney(0)}</div><div class="sub">${state.income.length} entries</div></div>
      <div class="card metric" style="animation-delay:80ms"><div class="label">Spent · today</div><div class="num" data-target="${spent}" data-prefix="${pfx}">${fmtMoney(0)}</div><div class="sub">${state.spending.filter(s=>s.date===todayISO()).length} transactions</div></div>
      <div class="card metric" style="animation-delay:160ms"><div class="label">Total debt</div><div class="num" data-target="${debt}" data-prefix="${pfx}">${fmtMoney(0)}</div><div class="sub">${state.debts.filter(d=>!d.paid).length} open</div></div>
      <div class="card metric" style="animation-delay:240ms"><div class="label">Net · this month</div><div class="num" data-target="${net}" data-prefix="${pfx}" style="color:${net >= 0 ? 'var(--good)' : 'var(--danger)'}">${fmtMoney(0)}</div><div class="sub">${netDeltaLabel}</div></div>
    </div>
    ${alertsHtml}
    <div class="card" style="margin-top:18px; animation-delay:220ms">
      <div class="section-title" style="margin-top:0">Last 7 days spending <span class="meta">${fmtMoney(days.reduce((a,b)=>a+b.total,0))}</span></div>
      <div class="bar-chart">
        ${days.map((d,i) => `
          <div class="col ${d.total===0?'dim':''}${d.isToday?' today':''}" title="${d.dateLabel}${d.isToday?' (today)':''} · ${fmtMoney(d.total)}" tabindex="0">
            <div class="bar-track">
              <div class="bar" style="height:${d.total===0?6:Math.max(8,(d.total/max)*100)}%"></div>
            </div>
            <div class="lbl">${d.label}</div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

/* ---- FINANCE: INCOME ---- */
function renderIncome() {
  const today      = todayISO();
  const ym         = ymLocal(new Date());
  const yy         = today.slice(0, 4);
  const filter     = state.incomeFilter || 'month';
  const pickedDate = state.incomePickedDate || null;
  const pfx        = window.__HQ_TWEAKS.currencyPrefix || '$';

  let filteredIncome;
  if (pickedDate) {
    filteredIncome = state.income.filter(i => i.date === pickedDate);
  } else if (filter === 'month') {
    filteredIncome = state.income.filter(i => (i.date || '').startsWith(ym));
  } else if (filter === 'year') {
    filteredIncome = state.income.filter(i => (i.date || '').startsWith(yy));
  } else {
    filteredIncome = state.income.slice();
  }

  const total = filteredIncome.reduce((s, i) => s + Number(i.amount || 0), 0);
  const count = filteredIncome.length;
  const avg   = count ? Math.round(total / count) : 0;
  const cardLabel = pickedDate
    ? `On ${fmtDate(pickedDate)}`
    : ({ month: 'This Month', year: 'This Year', all: 'All Time' }[filter]);

  const items      = filteredIncome.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const PAGE_SIZE  = 7;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.incomePage = Math.min(state.incomePage || 1, totalPages);
  const page       = state.incomePage;
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return `
    ${topbar()}
    <div class="projects-header" style="margin-bottom:18px">
      <h1 class="page-title" style="margin:0">Income</h1>
      <button class="add-btn-inline" data-modal-add="income">+ Log income</button>
    </div>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">${cardLabel}</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${total}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="sub" style="color:var(--text-faint); margin-top:6px;">${count} entr${count === 1 ? 'y' : 'ies'} · avg ${fmtMoney(avg)}</div>
      <div class="spend-filters">
        <div class="spend-filter-tabs">
          ${['month','year','all'].map(f =>
            `<button class="pill${!pickedDate && filter === f ? ' active' : ''}" data-income-filter="${f}">${{month:'This Month',year:'This Year',all:'All Time'}[f]}</button>`
          ).join('')}
        </div>
        <div class="spend-date-wrap">
          <span class="spend-date-label">Jump to date</span>
          <input type="date" id="income-date-input" class="spend-date-input" value="${pickedDate || ''}"/>
          ${pickedDate ? `<button id="income-date-clear" class="spend-date-clear" title="Clear">×</button>` : ''}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:60ms">
      <div class="section-title" style="margin-top:0">Log</div>
      <ul class="list">
        ${pageItems.map(i => `
          <li class="fin-item" data-id="${i.id}">
            <div class="fin-row">
              <div class="fin-row-left">
                <div class="fin-row-line1">
                  <span class="fin-row-title">${escapeHtml(i.source)}</span>
                </div>
                <div class="fin-row-time">${fmtDate(i.date)}</div>
              </div>
              <div class="fin-row-right">
                <div class="fin-acts">
                  <button class="fin-edit-btn" data-edit-income="${i.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-income="${i.id}" title="Delete">${ICON_TRASH}</button>
                </div>
                <div class="fin-row-amt income">+${fmtMoney(i.amount)}</div>
              </div>
            </div>
          </li>`).join('') || `<li class="list-item"><div class="item-sub">No income yet.</div></li>`}
      </ul>
    </div>
  `;
}

/* ---- FINANCE: SPENDING ---- */
function renderSpending() {
  const today = todayISO();
  const filter = state.spendingFilter || 'daily';
  const pickedDate = state.spendingPickedDate || null;
  const cats = ['Food','Transport','Shopping','Other'];
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';

  // filtered set for stats + recent log
  let filteredSpending;
  if (pickedDate) {
    filteredSpending = state.spending.filter(s => s.date === pickedDate);
  } else if (filter === 'daily') {
    filteredSpending = state.spending.filter(s => s.date === today);
  } else if (filter === 'weekly') {
    const now = new Date(); const dow = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); mon.setHours(0,0,0,0);
    const monISO = isoLocal(mon);
    filteredSpending = state.spending.filter(s => s.date >= monISO && s.date <= today);
  } else if (filter === 'all') {
    filteredSpending = state.spending.slice();
  } else {
    const firstISO = today.slice(0,7) + '-01';
    filteredSpending = state.spending.filter(s => s.date >= firstISO && s.date <= today);
  }

  const total = filteredSpending.reduce((s,x) => s+Number(x.amount||0), 0);
  const byCat = Object.fromEntries(cats.map(c => [c, filteredSpending.filter(s=>s.cat===c).reduce((s,x)=>s+Number(x.amount||0),0)]));
  const totalLabel = pickedDate
    ? `Total on ${fmtDate(pickedDate)}`
    : ({daily:"Today's total", weekly:"This week's total", monthly:"This month's total", all:"All-time total"}[filter]);

  const recent = filteredSpending.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  // "Recent" list mirrors Home's Activity feed: capped at 5 rows + a "Show all" /
  // "Show less" toggle, instead of the old (never-shown) page-7-at-a-time pager.
  const RECENT_CAP = 5;
  const showAllSpend = !!state.spendingShowAll;
  const cappedSpend = !showAllSpend && recent.length > RECENT_CAP;
  const visibleSpending = cappedSpend ? recent.slice(0, RECENT_CAP) : recent;

  return `
    ${topbar()}
    <div class="projects-header" style="margin-bottom:18px">
      <h1 class="page-title" style="margin:0">Spending</h1>
      <button class="add-btn-inline" data-modal-add="spend">+ Log spend</button>
    </div>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">${totalLabel}</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${total}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="pills" style="margin-top:16px">
        ${cats.map(c => `<span class="pill cat">${c}<span class="amt">${fmtMoney(byCat[c])}</span></span>`).join('')}
      </div>
      <div class="spend-filters">
        <div class="spend-filter-tabs">
          ${['daily','weekly','monthly','all'].map(f => `<button class="pill${!pickedDate && filter===f?' active':''}" data-spend-filter="${f}">${{daily:'Daily',weekly:'Weekly',monthly:'Monthly',all:'All Time'}[f]}</button>`).join('')}
        </div>
        <div class="spend-date-wrap">
          <span class="spend-date-label">Jump to date</span>
          <input type="date" id="spend-date-input" class="spend-date-input" value="${pickedDate||''}"/>
          ${pickedDate ? `<button id="spend-date-clear" class="spend-date-clear" title="Clear">×</button>` : ''}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:80ms">
      <div class="section-title" style="margin-top:0">Recent</div>
      <ul class="list">
        ${visibleSpending.map(s => `
          <li class="fin-item" data-id="${s.id}">
            <div class="fin-row">
              <div class="fin-row-left">
                <div class="fin-row-line1">
                  <span class="fin-cat-pill">${escapeHtml(s.cat)}</span>
                  <span class="fin-row-title">${escapeHtml((s.note||s.cat).slice(0,40))}</span>
                </div>
                <div class="fin-row-time">${s.date===today?s.time:fmtDate(s.date)}</div>
              </div>
              <div class="fin-row-right">
                <div class="fin-acts">
                  <button class="fin-edit-btn" data-edit-spend="${s.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-spend="${s.id}" title="Delete">${ICON_TRASH}</button>
                </div>
                <div class="fin-row-amt">−${fmtMoney(s.amount)}</div>
              </div>
            </div>
          </li>`).join('') || `<li class="list-item"><div class="item-sub">No spending yet.</div></li>`}
      </ul>
      ${cappedSpend ? `<button class="act-feed-toggle" data-spend-feed-toggle>Show all ${recent.length} activities</button>` : ''}
      ${!cappedSpend && showAllSpend && recent.length > RECENT_CAP ? `<button class="act-feed-toggle" data-spend-feed-toggle>Show less</button>` : ''}
    </div>
  `;
}

/* ---- FINANCE: DEBTS ---- */
function renderDebts() {
  const sorted = state.debts.slice().sort((a,b)=>(a.paid?1:0)-(b.paid?1:0)||(a.due||'').localeCompare(b.due||''));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';
  const PAGE_SIZE = 7;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.debtsPage = Math.min(state.debtsPage || 1, totalPages);
  const page = state.debtsPage;
  const pageItems = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  return `
    ${topbar()}
    <div class="projects-header" style="margin-bottom:18px">
      <h1 class="page-title" style="margin:0">Debts</h1>
      <button class="add-btn-inline" data-modal-add="debt">+ Add debt</button>
    </div>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">Open total</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${totalDebt()}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="sub" style="color:var(--text-faint); margin-top:6px;">${state.debts.filter(d=>!d.paid).length} open · ${state.debts.filter(d=>d.paid).length} paid</div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:60ms">
      <div class="section-title" style="margin-top:0">All debts</div>
      <ul class="list">
        ${pageItems.map(d => {
          const days = daysUntil(d.due);
          const soon = !d.paid && days <= 7 && days >= 0;
          const overdue = !d.paid && days < 0;
          const dueLabel = d.paid ? `Paid` : (overdue ? `Overdue · ${fmtDate(d.due)}` : (days===0?`Due today`:`Due in ${days}d · ${fmtDate(d.due)}`));
          return `
          <li class="fin-item" data-id="${d.id}">
            <div class="fin-row">
              <div class="fin-row-left">
                <div class="fin-row-line1">
                  <span class="fin-row-title">${escapeHtml(d.creditor)}</span>
                </div>
                <div class="debt-due ${soon||overdue?'soon':''}" style="font-size:12px;margin-top:3px">${dueLabel}</div>
              </div>
              <div class="fin-row-right">
                <div class="fin-acts">
                  ${d.paid
                    ? `<button class="fin-edit-btn debt-pay-btn debt-pay-btn--paid" data-pay-debt="${d.id}" title="Mark as unpaid">${ICON_UNDO}</button>`
                    : `<button class="fin-edit-btn debt-pay-btn debt-pay-btn--unpaid" data-pay-debt="${d.id}" title="Mark as paid">${ICON_CHECK}</button>`}
                  <button class="fin-edit-btn" data-edit-debt="${d.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-debt="${d.id}" title="Delete">${ICON_TRASH}</button>
                </div>
                <div class="fin-row-amt">${fmtMoney(d.amount)}</div>
              </div>
            </div>
          </li>`;
        }).join('') || `<li class="list-item"><div class="item-sub">No debts recorded.</div></li>`}
      </ul>
      ${totalPages > 1 ? `
      <div class="debts-pager">
        <button class="proj-nav-btn" data-debts-page-nav="-1" ${page<=1?'disabled':''} title="Previous page">&#x2039;</button>
        <span class="debts-pager-label">Page ${page} of ${totalPages}</span>
        <button class="proj-nav-btn" data-debts-page-nav="1" ${page>=totalPages?'disabled':''} title="Next page">&#x203A;</button>
      </div>` : ''}
    </div>
  `;
}


/* ---- FINANCE: event binding ---- */

function bindFinanceEvents() {
  // debts: prev/next page
  main.querySelectorAll('[data-debts-page-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.debtsPageNav);
    const PAGE_SIZE = 7;
    const totalPages = Math.max(1, Math.ceil(state.debts.length / PAGE_SIZE));
    state.debtsPage = Math.min(totalPages, Math.max(1, (state.debtsPage || 1) + dir));
    render();
  }));


  // ---- INCOME ----
  main.querySelectorAll('[data-del-income]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delIncome;
    showConfirmModal({
      title: 'Delete Income Entry?',
      message: 'Remove this income record?',
      onConfirm: () => {
        state.income = state.income.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('income_entries').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-income]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editIncome;
    const item = state.income.find(x => x.id === id);
    if (!item) return;
    showModal({
      title: 'Edit Income',
      fields: [
        { id: 'source', label: 'Source', type: 'text',   value: item.source },
        { id: 'amount', label: 'Amount', type: 'amount', value: item.amount },
        { id: 'date',   label: 'Date',   type: 'date',   value: item.date }
      ],
      saveLabel: 'Save',
      onSave: ({ source, amount, date }) => {
        const src = source.trim();
        const amt = Number(amount);
        if (!src || !amt) return;
        item.source = src; item.amount = amt; item.date = date;
        render();
        dbCall(() => sb.from('income_entries').update({ source: src, amount: amt, date }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="income"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Log Income',
      fields: [
        { id: 'source', label: 'Source', type: 'text',   value: '', placeholder: 'e.g. Client A' },
        { id: 'amount', label: 'Amount', type: 'amount', value: '', placeholder: '0' },
        { id: 'date',   label: 'Date',   type: 'date',   value: todayISO() }
      ],
      saveLabel: 'Add',
      onSave: async ({ source, amount, date }) => {
        const src = source.trim();
        const amt = Number(amount);
        if (!src || !amt) return;
        const { data } = await dbCall(() => sb.from('income_entries').insert({ user_id: currentUser.id, date: date || todayISO(), source: src, amount: amt }).select().single());
        if (data) { state.income.unshift({ id: data.id, date: data.date, source: src, amount: amt }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-income-filter]').forEach(el => el.addEventListener('click', () => {
    state.incomeFilter = el.dataset.incomeFilter;
    state.incomePickedDate = null;
    state.incomePage = 1;
    render();
  }));

  const incomeDateInput = main.querySelector('#income-date-input');
  if (incomeDateInput) incomeDateInput.addEventListener('change', () => {
    state.incomePickedDate = incomeDateInput.value || null;
    state.incomePage = 1;
    render();
  });

  const incomeDateClear = main.querySelector('#income-date-clear');
  if (incomeDateClear) incomeDateClear.addEventListener('click', () => {
    state.incomePickedDate = null;
    state.incomePage = 1;
    render();
  });


  // ---- SPENDING ----
  const _spendCats = ['Food', 'Transport', 'Shopping', 'Other'];

  main.querySelectorAll('[data-del-spend]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delSpend;
    showConfirmModal({
      title: 'Delete Spending Entry?',
      message: 'Remove this spending record?',
      onConfirm: () => {
        state.spending = state.spending.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('spending_entries').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-spend]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editSpend;
    const item = state.spending.find(x => x.id === id);
    if (!item) return;
    showModal({
      title: 'Edit Spending',
      fields: [
        { id: 'cat',    label: 'Category', type: 'select', value: item.cat,     options: _spendCats.map(c => ({ value: c, label: c })) },
        { id: 'amount', label: 'Amount',   type: 'amount', value: item.amount },
        { id: 'note',   label: 'Note',     type: 'text',   value: item.note || '', placeholder: 'What was it?' }
      ],
      saveLabel: 'Save',
      onSave: ({ cat, amount, note }) => {
        const amt = Number(amount);
        if (!amt) return;
        item.cat = cat; item.amount = amt; item.note = note.trim();
        render();
        dbCall(() => sb.from('spending_entries').update({ category: cat, amount: amt, note: note.trim(), time: item.time }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="spend"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Log Spending',
      fields: [
        { id: 'cat',    label: 'Category', type: 'select', value: 'Food',  options: _spendCats.map(c => ({ value: c, label: c })) },
        { id: 'amount', label: 'Amount',   type: 'amount', value: '',      placeholder: '0' },
        { id: 'note',   label: 'Note',     type: 'text',   value: '',      placeholder: 'What was it?' }
      ],
      saveLabel: 'Add',
      onSave: async ({ cat, amount, note }) => {
        const amt = Number(amount);
        if (!amt) return;
        const t = new Date();
        const time = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
        const date = todayISO();
        const { data } = await dbCall(() => sb.from('spending_entries').insert({ user_id: currentUser.id, date, time, category: cat, note: note.trim(), amount: amt }).select().single());
        if (data) { state.spending.unshift({ id: data.id, date, time, cat, note: note.trim(), amount: amt }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-spend-filter]').forEach(el => el.addEventListener('click', () => {
    state.spendingFilter = el.dataset.spendFilter;
    state.spendingPickedDate = null;
    state.spendingPage = 1;
    state.spendingShowAll = false;
    render();
  }));

  const spendDateInput = main.querySelector('#spend-date-input');
  if (spendDateInput) spendDateInput.addEventListener('change', () => {
    state.spendingPickedDate = spendDateInput.value || null;
    state.spendingPage = 1;
    state.spendingShowAll = false;
    render();
  });

  const spendDateClear = main.querySelector('#spend-date-clear');
  if (spendDateClear) spendDateClear.addEventListener('click', () => {
    state.spendingPickedDate = null;
    state.spendingPage = 1;
    state.spendingShowAll = false;
    render();
  });

  // spending: "Recent" list — "Show all" / "Show less" toggle (mirrors Home's Activity feed)
  const spendFeedToggle = main.querySelector('[data-spend-feed-toggle]');
  if (spendFeedToggle) spendFeedToggle.addEventListener('click', () => {
    state.spendingShowAll = !state.spendingShowAll;
    render();
  });


  // ---- DEBTS ----
  main.querySelectorAll('[data-del-debt]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delDebt;
    const d = state.debts.find(x => x.id === id);
    showConfirmModal({
      title: 'Delete Debt?',
      message: `Remove "${d?.creditor || 'this debt'}" from your debts?`,
      onConfirm: () => {
        state.debts = state.debts.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('debts').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-debt]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editDebt;
    const item = state.debts.find(d => d.id === id);
    if (!item) return;
    showModal({
      title: 'Edit Debt',
      fields: [
        { id: 'creditor', label: 'Creditor', type: 'text',   value: item.creditor },
        { id: 'amount',   label: 'Amount',   type: 'amount', value: item.amount },
        { id: 'due',      label: 'Due date', type: 'date',   value: item.due || '' }
      ],
      saveLabel: 'Save',
      onSave: ({ creditor, amount, due }) => {
        const cred = creditor.trim();
        const amt = Number(amount);
        if (!cred || !amt) return;
        item.creditor = cred; item.amount = amt; item.due = due;
        render();
        dbCall(() => sb.from('debts').update({ creditor: cred, amount: amt, due_date: due }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="debt"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Add Debt',
      fields: [
        { id: 'creditor', label: 'Creditor', type: 'text',   value: '', placeholder: 'Who do you owe?' },
        { id: 'amount',   label: 'Amount',   type: 'amount', value: '', placeholder: '0' },
        { id: 'due',      label: 'Due date', type: 'date',   value: todayISO() }
      ],
      saveLabel: 'Add',
      onSave: async ({ creditor, amount, due }) => {
        const cred = creditor.trim();
        const amt = Number(amount);
        if (!cred || !amt) return;
        const { data } = await dbCall(() => sb.from('debts').insert({ user_id: currentUser.id, creditor: cred, amount: amt, due_date: due, paid: false }).select().single());
        if (data) { state.debts.push({ id: data.id, creditor: cred, amount: amt, due, paid: false }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-pay-debt]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.payDebt;
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    try {
      if (d.paid) {
        await dbCall(() => sb.from('debts').update({ paid: false }).eq('id', id));
        d.paid = false;
        render();
        showToast('Marked as unpaid');
      } else {
        await dbCall(() => sb.from('debts').update({ paid: true }).eq('id', id));
        d.paid = true;
        render();
        showToast('Marked as paid');
      }
    } catch (e) {
      // dbCall already shows the failure toast
    }
  }));


}

