/* =========================================================
   Life — Projects
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */

/* ---- LIFE: PROJECTS ---- */
function renderProjectCard(p, i) {
  const isExpanded = (state.expandedProjectIds || []).includes(p.id);
  const doneTasks  = p.tasks.filter(t => t.checked).length;
  const totalTasks = p.tasks.length;
  const pct        = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0;
  const isDone     = p.status === 'done';

  let deadlineHtml = '';
  if (p.deadline) {
    const days = daysUntil(p.deadline);
    const isUrgent  = !isDone && days <= 7 && days >= 0;
    const isOverdue = !isDone && days < 0;
    const label = isDone ? fmtDate(p.deadline)
                : days === 0 ? 'Due today'
                : days < 0  ? `Overdue · ${fmtDate(p.deadline)}`
                : `Due ${fmtDate(p.deadline)}`;
    deadlineHtml = `<span class="proj-deadline${isUrgent||isOverdue?' urgent':''}">${label}</span>`;
  }

  const statusLabels = { active: 'Active', on_hold: 'On Hold', done: 'Done' };
  const statusBadge  = `<span class="proj-badge proj-badge-${p.status}">${statusLabels[p.status]}</span>`;

  return `
    <div class="card proj-card" style="animation-delay:${i*60}ms" data-proj-id="${p.id}">
      <div class="proj-card-header">
        <div class="proj-card-title-row">
          <div class="proj-name${isDone?' done':''}">${escapeHtml(p.name)}</div>
          <div class="proj-meta-row">
            ${statusBadge}
            ${deadlineHtml}
          </div>
        </div>
        <div class="proj-card-acts">
          <button class="fin-edit-btn" data-edit-proj="${p.id}" title="Edit">&#x270E;</button>
          <button class="fin-del-btn" data-del-proj="${p.id}" title="Delete">${ICON_TRASH}</button>
        </div>
      </div>
      ${p.description ? `<div class="proj-desc">${escapeHtml(p.description.length > 120 ? p.description.slice(0, 120) + '...' : p.description)}</div>` : ''}
      ${totalTasks > 0 ? `
        <div class="proj-progress">
          <div class="proj-progress-meta">
            <span>${doneTasks} / ${totalTasks} tasks done</span>
            <span>${pct}%</span>
          </div>
          <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
        </div>
      ` : ''}
      <button class="proj-expand-btn" data-toggle-proj-expand="${p.id}">
        <span>${isExpanded?'▼':'▶'}</span>
        <span>${isExpanded?'Hide tasks':'Show tasks'}</span>
      </button>
      ${isExpanded ? `
        <div class="proj-tasks" id="proj-tasks-${p.id}">
          <ul class="list" style="margin-top:4px">
            ${p.tasks.map(t => `
              <li class="focus-task-item" data-id="${t.id}">
                <div class="list-item row-wrap" style="padding:10px 0; align-items:flex-start">
                  <span class="check ${t.checked?'checked':''}" data-toggle-proj-task="${p.id}|${t.id}" style="margin-top:2px;flex-shrink:0"></span>
                  <div class="check-label ${t.checked?'done':''}" style="flex:1;min-width:0">
                    <div>${escapeHtml(t.text)}</div>
                    ${t.description ? `<div class="task-desc-text">${escapeHtml(t.description.length>80?t.description.slice(0,80)+'...':t.description)}</div>` : ''}
                  </div>
                  <div class="focus-task-acts">
                    <button class="fin-assign-btn" data-assign-proj-task="${p.id}|${t.id}" title="Assign to today's schedule">&#x1F4C5;</button>
                    <button class="fin-edit-btn" data-edit-proj-task="${p.id}|${t.id}">&#x270E;</button>
                    <button class="fin-del-btn" data-del-proj-task="${p.id}|${t.id}" title="Delete">${ICON_TRASH}</button>
                  </div>
                </div>
              </li>
            `).join('')}
          </ul>
          <button class="add-btn" data-modal-add="proj-task" data-proj-id="${p.id}" style="margin-top:10px"><span class="plus">+</span> Add task</button>
        </div>
      ` : ''}
    </div>`;
}

function renderProjects() {
  const filter = state.projectsFilter || 'all';
  const allProjects = state.projects || [];
  const filtered = filter === 'all' ? allProjects : allProjects.filter(p => p.status === filter);
  const filterLabels = { all: 'All', active: 'Active', on_hold: 'On Hold', done: 'Done' };

  return `
    ${topbar()}
    <div class="projects-header">
      <h1 class="page-title" style="margin:0">Projects</h1>
      <button class="add-btn-inline" data-modal-add="project">+ New Project</button>
    </div>
    <div class="pills" style="margin: 14px 0 18px">
      ${['all','active','on_hold','done'].map(f =>
        `<button class="pill${filter===f?' active':''}" data-proj-filter="${f}">${filterLabels[f]}</button>`
      ).join('')}
    </div>
    ${filtered.length === 0
      ? `<div style="color:var(--text-faint);font-size:13px;padding:20px 0">No projects${filter!=='all'?' with this status':''}.</div>`
      : filtered.map((p, i) => renderProjectCard(p, i)).join('')
    }
  `;
}


/* ---- PROJECTS: event binding ---- */

function bindProjectsEvents() {
  // project filter pills
  main.querySelectorAll('[data-proj-filter]').forEach(el => el.addEventListener('click', () => {
    state.projectsFilter = el.dataset.projFilter;
    render();
  }));


  // project expand/collapse
  main.querySelectorAll('[data-toggle-proj-expand]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.toggleProjExpand;
    const idx = state.expandedProjectIds.indexOf(id);
    if (idx === -1) state.expandedProjectIds.push(id);
    else state.expandedProjectIds.splice(idx, 1);
    render();
  }));


  // project task toggle (Today + Projects pages)
  main.querySelectorAll('[data-toggle-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [projId, taskId] = el.dataset.toggleProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const task = proj.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.checked = !task.checked;
    task.completed_at = task.checked ? new Date().toISOString() : null;
    pulse(el); render();
    dbCall(() => sb.from('project_tasks').update({ checked: task.checked, completed_at: task.completed_at }).eq('id', taskId));
  }));


  // project delete
  main.querySelectorAll('[data-del-proj]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delProj;
    const proj = state.projects.find(p => p.id === id);
    showConfirmModal({
      title: 'Delete Project?',
      message: `This will permanently delete "${proj?.name || 'this project'}" and all its tasks. This cannot be undone.`,
      onConfirm: () => {
        state.projects = state.projects.filter(p => p.id !== id);
        state.expandedProjectIds = state.expandedProjectIds.filter(eid => eid !== id);
        render();
        dbCall(() => sb.from('projects').delete().eq('id', id));
      }
    });
  }));


  // project task assign to today's schedule
  main.querySelectorAll('[data-assign-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [projId, taskId] = el.dataset.assignProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const task = proj.tasks.find(t => t.id === taskId);
    if (!task) return;
    const day = todayISO();
    showModal({
      title: 'Assign to Today\'s Schedule',
      fields: [
        { id: 'time',       label: 'Time',       type: 'time',     value: '09:00' },
        { id: 'title',      label: 'Title',      type: 'text',     value: task.text },
        { id: 'note',       label: 'Note',       type: 'text',     value: task.description || '', placeholder: 'optional' },
        { id: 'alarm',      label: 'Set alarm',  type: 'toggle',   value: false, controls: 'alarm_time' },
        { id: 'alarm_time', label: 'Alarm time', type: 'time',     value: '09:00' }
      ],
      saveLabel: 'Assign',
      onSave: async ({ time, title, note, alarm, alarm_time }) => {
        if (!title.trim()) return;
        const alarm_time_val = alarm ? (alarm_time || time) : null;
        const { data } = await dbCall(() => sb.from('schedule_events').insert({ user_id: currentUser.id, date: day, time, title: title.trim(), note: note.trim(), alarm_time: alarm_time_val }).select().single());
        if (data) {
          if (!state.schedule[day]) state.schedule[day] = [];
          state.schedule[day].push({ id: data.id, time, title: title.trim(), sub: note.trim(), alarm_time: alarm_time_val, completed_at: null });
          state.schedule[day].sort((a, b) => a.time.localeCompare(b.time));
          showToast('Assigned to today\'s schedule');
          render();
        }
      }
    });
  }));


  // project task delete
  main.querySelectorAll('[data-del-proj-task]').forEach(el => el.addEventListener('click', () => {
    const [projId, taskId] = el.dataset.delProjTask.split('|');
    showConfirmModal({
      title: 'Delete Task?',
      message: 'Remove this task from the project?',
      onConfirm: () => {
        const proj = state.projects.find(p => p.id === projId);
        if (!proj) return;
        proj.tasks = proj.tasks.filter(t => t.id !== taskId);
        render();
        dbCall(() => sb.from('project_tasks').delete().eq('id', taskId));
      }
    });
  }));


  // ---- PROJECTS ----
  main.querySelectorAll('[data-modal-add="project"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'New Project',
      fields: [
        { id: 'name',        label: 'Project name',        type: 'text',     value: '', placeholder: 'e.g. Client Website' },
        { id: 'description', label: 'Description',         type: 'textarea', value: '', placeholder: 'Optional project description' },
        { id: 'status',      label: 'Status',              type: 'select',   value: 'active', options: [{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On Hold' }, { value: 'done', label: 'Done' }] },
        { id: 'deadline',    label: 'Deadline (optional)', type: 'date',     value: '' }
      ],
      saveLabel: 'Add',
      onSave: async ({ name, description, status, deadline }) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const now = new Date().toISOString();
        const { data } = await dbCall(() => sb.from('projects').insert({ user_id: currentUser.id, name: trimmed, description: description.trim() || null, status, deadline: deadline || null, updated_at: now }).select().single());
        if (data) { state.projects.push({ id: data.id, name: trimmed, description: description.trim(), status, deadline: data.deadline, tasks: [] }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-edit-proj]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editProj;
    const proj = state.projects.find(p => p.id === id);
    if (!proj) return;
    showModal({
      title: 'Edit Project',
      fields: [
        { id: 'name',        label: 'Project name', type: 'text',     value: proj.name },
        { id: 'description', label: 'Description',  type: 'textarea', value: proj.description || '', placeholder: 'Optional project description' },
        { id: 'status',      label: 'Status',       type: 'select',   value: proj.status, options: [{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On Hold' }, { value: 'done', label: 'Done' }] },
        { id: 'deadline',    label: 'Deadline',     type: 'date',     value: proj.deadline || '' }
      ],
      saveLabel: 'Save',
      onSave: ({ name, description, status, deadline }) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        proj.name = trimmed; proj.description = description.trim(); proj.status = status; proj.deadline = deadline || null;
        render();
        dbCall(() => sb.from('projects').update({ name: trimmed, description: description.trim() || null, status, deadline: deadline || null, updated_at: new Date().toISOString() }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="proj-task"]').forEach(btn => btn.addEventListener('click', () => {
    const projId = btn.dataset.projId;
    showModal({
      title: 'Add Task',
      fields: [
        { id: 'text',        label: 'Task',        type: 'text',     value: '', placeholder: 'What needs to be done?' },
        { id: 'description', label: 'Description', type: 'textarea', value: '', placeholder: 'Description (optional)' }
      ],
      saveLabel: 'Add',
      onSave: async ({ text, description }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const proj = state.projects.find(p => p.id === projId);
        if (!proj) return;
        const { data } = await dbCall(() => sb.from('project_tasks').insert({ user_id: currentUser.id, project_id: projId, text: trimmed, description: description.trim() || null, checked: false }).select().single());
        if (data) { proj.tasks.push({ id: data.id, text: trimmed, description: description.trim(), checked: false, completed_at: null }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-edit-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [projId, taskId] = el.dataset.editProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const task = proj.tasks.find(t => t.id === taskId);
    if (!task) return;
    showModal({
      title: 'Edit Task',
      fields: [
        { id: 'text',        label: 'Task',        type: 'text',     value: task.text },
        { id: 'description', label: 'Description', type: 'textarea', value: task.description || '', placeholder: 'Description (optional)' }
      ],
      saveLabel: 'Save',
      onSave: ({ text, description }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        task.text = trimmed; task.description = description.trim();
        render();
        dbCall(() => sb.from('project_tasks').update({ text: trimmed, description: description.trim() || null }).eq('id', taskId));
      }
    });
  }));

}

