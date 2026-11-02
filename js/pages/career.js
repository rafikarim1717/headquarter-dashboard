/* =========================================================
   CAREER — Job Pipeline (career:jobs, 2026-11-01)
   Kanban of job applications backed by `job_applications`.
   Column = status. last_moved is bumped to today on every save
   and every column move; cards in action/waiting untouched for
   more than JOB_STALE_DAYS are flagged red.
========================================================= */
const JOB_COLUMNS = [
  { key: 'action',  label: 'Action needed', hint: 'Ball in my court' },
  { key: 'waiting', label: 'Waiting',       hint: 'Ball in theirs' },
  { key: 'offer',   label: 'Offer',         hint: '' },
  { key: 'closed',  label: 'Closed',        hint: '' }
];
const JOB_TRACKS = [
  { value: 'lokal',    label: 'Lokal' },
  { value: 'remote',   label: 'Remote' },
  { value: 'side_gig', label: 'Side gig' }
];
const JOB_STALE_DAYS = 7;

function jobDaysBetween(fromIso, toIso) {
  // both are plain YYYY-MM-DD → parsed as UTC midnight, so the diff is whole days
  return Math.round((new Date(toIso) - new Date(fromIso)) / 86400000);
}
function jobIsStale(j) {
  return (j.status === 'action' || j.status === 'waiting') && jobDaysBetween(j.last_moved, todayISO()) > JOB_STALE_DAYS;
}
function jobTrackLabel(t) {
  return (JOB_TRACKS.find(x => x.value === t) || JOB_TRACKS[0]).label;
}
function jobSort(a, b) {
  // nearest deadline first (no deadline last), then the stalest card first
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (a.deadline && !b.deadline) return -1;
  if (!a.deadline && b.deadline) return 1;
  return a.last_moved < b.last_moved ? -1 : a.last_moved > b.last_moved ? 1 : 0;
}

function jobDeadlineChip(j) {
  if (!j.deadline || j.status === 'closed') return '';
  const d = jobDaysBetween(todayISO(), j.deadline);
  let cls = '', txt;
  if (d < 0)       { cls = ' overdue'; txt = `Overdue ${-d}d`; }
  else if (d === 0){ cls = ' soon';    txt = 'Due today'; }
  else if (d <= 2) { cls = ' soon';    txt = `Due in ${d}d`; }
  else             { txt = `Due ${new Date(j.deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`; }
  return `<span class="job-deadline${cls}">${txt}</span>`;
}

function jobCardHtml(j, colIdx) {
  const days = jobDaysBetween(j.last_moved, todayISO());
  const moved = days <= 0 ? 'Moved today' : `Moved ${days}d ago`;
  const stale = jobIsStale(j);
  return `
    <div class="job-card${stale ? ' stale' : ''}" data-job-id="${j.id}">
      <div class="job-card-top">
        <div class="job-company">${escapeHtml(j.company)}</div>
        <span class="job-track job-track-${j.track}">${jobTrackLabel(j.track)}</span>
      </div>
      <div class="job-role">${escapeHtml(j.role)}</div>
      ${j.stage ? `<div class="job-stage">${escapeHtml(j.stage)}</div>` : ''}
      ${j.next_step ? `<div class="job-next">→ ${escapeHtml(j.next_step)}</div>` : ''}
      <div class="job-card-foot">
        <div class="job-meta">${jobDeadlineChip(j)}<span class="job-moved${stale ? ' stale' : ''}" title="Last moved ${j.last_moved}">${moved}</span></div>
        <div class="job-actions">
          <button class="job-btn" data-job-move="-1|${j.id}" title="Move left" aria-label="Move left"${colIdx === 0 ? ' disabled' : ''}>‹</button>
          <button class="job-btn" data-job-move="1|${j.id}" title="Move right" aria-label="Move right"${colIdx === JOB_COLUMNS.length - 1 ? ' disabled' : ''}>›</button>
          <button class="job-btn" data-edit-job="${j.id}" title="Edit" aria-label="Edit">${ICON_PENCIL}</button>
          <button class="job-btn del" data-del-job="${j.id}" title="Delete" aria-label="Delete">${ICON_TRASH}</button>
        </div>
      </div>
    </div>`;
}

function renderJobPipeline() {
  const jobs = state.jobs || [];
  const staleN = jobs.filter(jobIsStale).length;
  const cols = JOB_COLUMNS.map((c, ci) => {
    const items = jobs.filter(j => j.status === c.key).sort(jobSort);
    return `
      <section class="job-col job-col-${c.key}">
        <div class="job-col-head">
          <span class="job-col-title">${c.label}</span>
          <span class="job-col-count">${items.length}</span>
          ${c.hint ? `<span class="job-col-hint">${c.hint}</span>` : ''}
        </div>
        <div class="job-col-body">
          ${items.length ? items.map(j => jobCardHtml(j, ci)).join('') : `<div class="job-empty">—</div>`}
        </div>
      </section>`;
  }).join('');
  return `
    ${topbar()}
    <div class="projects-header">
      <h1 class="page-title" style="margin:0">Job Pipeline</h1>
      <button class="add-btn-inline" data-modal-add="job">+ Add application</button>
    </div>
    ${staleN ? `<div class="job-stale-note">${staleN} application${staleN === 1 ? '' : 's'} not moved in over ${JOB_STALE_DAYS} days</div>` : ''}
    <div class="job-board">${cols}</div>
  `;
}

function jobFormFields(j) {
  return [
    { id: 'company',   label: 'Company',               type: 'text',   value: j ? j.company : '', placeholder: 'e.g. Logique' },
    { id: 'role',      label: 'Role',                  type: 'text',   value: j ? j.role : '', placeholder: 'e.g. Fullstack Developer' },
    { id: 'track',     label: 'Track',                 type: 'select', value: j ? j.track : 'lokal', options: JOB_TRACKS },
    { id: 'status',    label: 'Column',                type: 'select', value: j ? j.status : 'action', options: JOB_COLUMNS.map(c => ({ value: c.key, label: c.label })) },
    { id: 'stage',     label: 'Current stage',         type: 'text',   value: j ? j.stage : '', placeholder: 'e.g. HR + take-home clear' },
    { id: 'next_step', label: 'Next step',             type: 'text',   value: j ? j.next_step : '', placeholder: 'e.g. Submit take-home' },
    { id: 'deadline',  label: 'Deadline (optional)',   type: 'date',   value: j ? (j.deadline || '') : '' }
  ];
}
function parseJobForm(v) {
  const row = {
    company: (v.company || '').trim(),
    role: (v.role || '').trim(),
    track: v.track || 'lokal',
    status: v.status || 'action',
    stage: (v.stage || '').trim(),
    next_step: (v.next_step || '').trim(),
    deadline: v.deadline || null,
    last_moved: todayISO()
  };
  if (!row.company || !row.role) { showToast('Company and role are required', 'error'); return null; }
  return row;
}

function bindCareerEvents() {
  main.querySelectorAll('[data-modal-add="job"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Add Application',
      fields: jobFormFields(null),
      saveLabel: 'Add',
      onSave: async (values) => {
        const row = parseJobForm(values);
        if (!row) return Promise.reject();
        const { data } = await dbCall(() => sb.from('job_applications').insert({ user_id: currentUser.id, ...row }).select().single());
        if (data) { state.jobs.push(mapJobRow(data)); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-edit-job]').forEach(btn => btn.addEventListener('click', () => {
    const j = state.jobs.find(x => x.id === btn.dataset.editJob);
    if (!j) return;
    showModal({
      title: 'Edit Application',
      fields: jobFormFields(j),
      saveLabel: 'Save',
      onSave: (values) => {
        const row = parseJobForm(values);
        if (!row) return Promise.reject();
        Object.assign(j, row);
        render();
        dbCall(() => sb.from('job_applications').update(row).eq('id', j.id));
      }
    });
  }));

  main.querySelectorAll('[data-job-move]').forEach(btn => btn.addEventListener('click', () => {
    const [dir, id] = btn.dataset.jobMove.split('|');
    const j = state.jobs.find(x => x.id === id);
    if (!j) return;
    const idx = JOB_COLUMNS.findIndex(c => c.key === j.status) + Number(dir);
    if (idx < 0 || idx >= JOB_COLUMNS.length) return;
    j.status = JOB_COLUMNS[idx].key;
    j.last_moved = todayISO();
    render();
    dbCall(() => sb.from('job_applications').update({ status: j.status, last_moved: j.last_moved }).eq('id', id));
  }));

  main.querySelectorAll('[data-del-job]').forEach(btn => btn.addEventListener('click', () => {
    const j = state.jobs.find(x => x.id === btn.dataset.delJob);
    if (!j) return;
    showConfirmModal({
      title: 'Delete application?',
      message: `${j.company} — ${j.role} will be removed.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        state.jobs = state.jobs.filter(x => x.id !== j.id);
        render();
        dbCall(() => sb.from('job_applications').delete().eq('id', j.id));
      }
    });
  }));
}

function mapJobRow(r) {
  return {
    id: r.id, company: r.company, role: r.role, track: r.track || 'lokal', status: r.status || 'action',
    stage: r.stage || '', next_step: r.next_step || '', deadline: r.deadline || null,
    last_moved: r.last_moved || todayISO()
  };
}
