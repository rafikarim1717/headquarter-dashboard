/* =========================================================
   Life — Notes
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */

/* ---- notes editor: toolbar reference data ---- */
const NOTE_STYLE_OPTIONS = [
  { val: 'p',  label: 'Normal Text' },
  { val: 'h1', label: 'Title' },
  { val: 'h2', label: 'Subtitle' },
  { val: 'h3', label: 'Heading 1' },
  { val: 'h4', label: 'Heading 2' },
  { val: 'h5', label: 'Heading 3' }
];
const NOTE_FONTS = [
  { name: 'Arial',           family: 'Arial, sans-serif',              google: false, weights: [['400','Regular'], ['700','Bold']] },
  { name: 'Georgia',         family: 'Georgia, serif',                 google: false, weights: [['400','Regular'], ['700','Bold']] },
  { name: 'Times New Roman', family: '"Times New Roman", serif',       google: false, weights: [['400','Regular'], ['700','Bold']] },
  { name: 'Courier New',     family: '"Courier New", monospace',       google: false, weights: [['400','Regular'], ['700','Bold']] },
  { name: 'Verdana',         family: 'Verdana, sans-serif',            google: false, weights: [['400','Regular'], ['700','Bold']] },
  { name: 'Roboto',          family: '"Roboto", sans-serif',           google: true,  weights: [['300','Light'], ['400','Regular'], ['500','Medium'], ['700','Bold']] },
  { name: 'Poppins',         family: '"Poppins", sans-serif',          google: true,  weights: [['300','Light'], ['400','Regular'], ['500','Medium'], ['600','Semibold'], ['700','Bold']] },
  { name: 'Merriweather',    family: '"Merriweather", serif',          google: true,  weights: [['300','Light'], ['400','Regular'], ['700','Bold'], ['900','Black']] },
  { name: 'Lora',            family: '"Lora", serif',                  google: true,  weights: [['400','Regular'], ['500','Medium'], ['600','Semibold'], ['700','Bold']] },
  { name: 'Inter',           family: '"Inter", sans-serif',            google: true,  weights: [['300','Light'], ['400','Regular'], ['500','Medium'], ['600','Semibold'], ['700','Bold']] }
];
const NOTE_FONT_SIZE_PRESETS = [8, 9, 10, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
const NOTE_TEXT_COLORS  = ['#e0645a', '#e0a15a', '#7fbf7f', '#6ea8e0', '#b18ae0'];
const NOTE_HILITE_COLORS = ['#6b5f2a', '#2f5a3d', '#2a4a6b', '#6b2a4a', '#3a3a3a'];

function rgbToHex(rgb) {
  const m = (rgb || '').match(/\d+/g);
  if (!m || m.length < 3) return null;
  return '#' + m.slice(0, 3).map(n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')).join('');
}

let _noteFontsLoaded = false;
function ensureNoteFontsLoaded() {
  if (_noteFontsLoaded) return;
  _noteFontsLoaded = true;
  const families = NOTE_FONTS.filter(f => f.google)
    .map(f => `family=${f.name.replace(/ /g, '+')}:wght@${f.weights.map(w => w[0]).join(';')}`)
    .join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

/* ---- LIFE: NOTES ---- */
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function noteDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const noteStart  = new Date(d); noteStart.setHours(0,0,0,0);
  if (noteStart.getTime() === todayStart.getTime()) return 'Today';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function getFilteredNotes() {
  let notes = [...state.notes];
  if (state.notesFilter === 'today') {
    const t = todayISO();
    notes = notes.filter(n => (n.updated_at || n.created_at || '').slice(0, 10) === t);
  } else if (state.notesFilter === 'week') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    notes = notes.filter(n => new Date(n.updated_at || n.created_at) >= weekAgo);
  }
  if (state.notesSort === 'oldest') {
    notes.sort((a, b) => new Date(a.updated_at||a.created_at) - new Date(b.updated_at||b.created_at));
  } else if (state.notesSort === 'az') {
    notes.sort((a, b) => (a.title||'').localeCompare(b.title||''));
  } else {
    notes.sort((a, b) => new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at));
  }
  return notes;
}

function renderNotesList() {
  const notes  = getFilteredNotes();
  const isGrid = state.notesDisplay === 'grid';
  const sortLabels   = { newest: 'Newest', oldest: 'Oldest', az: 'A–Z' };
  const filterLabels = { all: 'All', today: 'Today', week: 'This week' };
  return `
    ${topbar()}
    <div class="notes-header">
      <h1 class="page-title" style="margin:0">Notes</h1>
      <div class="notes-controls">
        <div class="notes-ctrl-wrap">
          <button class="notes-ctrl-btn" id="notes-sort-btn">
            ${sortLabels[state.notesSort]}<span class="caret">▾</span>
          </button>
          <div class="notes-dropdown" id="notes-sort-dd">
            <button data-sort="newest" class="${state.notesSort==='newest'?'sel':''}">Newest</button>
            <button data-sort="oldest" class="${state.notesSort==='oldest'?'sel':''}">Oldest</button>
            <button data-sort="az"     class="${state.notesSort==='az'    ?'sel':''}">A–Z</button>
          </div>
        </div>
        <div class="notes-ctrl-wrap">
          <button class="notes-ctrl-btn" id="notes-filter-btn">
            ${filterLabels[state.notesFilter]}<span class="caret">▾</span>
          </button>
          <div class="notes-dropdown" id="notes-filter-dd">
            <button data-filter="all"   class="${state.notesFilter==='all'   ?'sel':''}">All</button>
            <button data-filter="today" class="${state.notesFilter==='today' ?'sel':''}">Today</button>
            <button data-filter="week"  class="${state.notesFilter==='week'  ?'sel':''}">This week</button>
          </div>
        </div>
        <button class="notes-ctrl-btn ${isGrid?'active':''}" id="notes-view-btn" title="Toggle layout">
          ${isGrid ? '▦' : '☰'}
        </button>
      </div>
    </div>
    <div class="${isGrid ? 'notes-grid' : 'notes-list-view'}">
      ${notes.map(n => {
        const preview = stripHtml(n.content);
        const previewText = preview.length > 100 ? preview.slice(0, 100) + '...' : preview;
        return `
        <div class="note-card" data-open-note="${n.id}">
          <button class="note-card-del" data-del-note-card="${n.id}" aria-label="Delete note" title="Delete">${ICON_TRASH}</button>
          <div class="note-card-title ${n.title?'':'empty'}">${n.title ? escapeHtml(n.title) : 'Untitled'}</div>
          <div class="note-card-preview">${escapeHtml(previewText)}</div>
          <div class="note-card-date" data-note-ts="${n.id}">${relativeTime(n.updated_at || n.created_at)}</div>
        </div>`;
      }).join('') || `<div style="color:var(--text-faint);font-size:13px;padding:20px 0">No notes yet.</div>`}
    </div>
    <button class="add-btn" id="add-note-btn" style="margin-top:18px"><span class="plus">+</span> New note</button>
  `;
}

function renderNoteEditor() {
  const n = state.notes.find(x => x.id === state.activeNoteId);
  if (!n) { state.activeNoteId = null; return renderNotesList(); }
  ensureNoteFontsLoaded();
  return `
    ${topbar()}
    <div class="note-editor-header">
      <button class="note-back-btn" id="note-back-btn">←</button>
      <div class="note-editor-meta">
        <span class="note-saved-lbl" id="note-saved-lbl">Saved</span>
      </div>
    </div>
    <input class="note-title-input" id="note-title" type="text"
      value="${escapeHtml(n.title || '')}" placeholder="Title" autocomplete="off"/>
    <div class="note-toolbar" id="note-toolbar">
      <div class="notes-ctrl-wrap tb-style-wrap">
        <button class="tb-btn tb-style-btn" id="tb-style-btn" data-dd-toggle title="Text style">
          <span id="tb-style-label">Normal Text</span><span class="caret">▾</span>
        </button>
        <div class="notes-dropdown tb-style-dd" id="tb-style-dd">
          ${NOTE_STYLE_OPTIONS.map(o => `<button data-block="${o.val}">${o.label}</button>`).join('')}
          <div class="tb-dd-sep"></div>
          <div class="tb-dd-more-wrap">
            <button class="tb-dd-more" id="tb-style-options-btn" data-dd-toggle>Options ▸</button>
            <div class="notes-dropdown tb-style-options-dd" id="tb-style-options-dd">
              <button data-style-action="save">Save as my default style</button>
              <button data-style-action="use">Use my default style</button>
              <button data-style-action="reset">Reset styles</button>
            </div>
          </div>
        </div>
      </div>
      <div class="tb-sep"></div>
      <div class="notes-ctrl-wrap tb-font-wrap">
        <button class="tb-btn tb-font-btn" id="tb-font-btn" data-dd-toggle title="Font family">
          <span id="tb-font-label">Font</span><span class="caret">▾</span>
        </button>
        <div class="notes-dropdown tb-font-dd" id="tb-font-dd">
          ${NOTE_FONTS.map(f => `
            <div class="tb-font-item-wrap">
              <button class="tb-font-item" data-font-toggle="${f.name}" style="font-family:${f.family}">${f.name}</button>
              <div class="tb-weight-list" data-weight-list="${f.name}">
                ${f.weights.map(([w, label]) => `<button data-font="${f.name}" data-weight="${w}" style="font-family:${f.family}; font-weight:${w}">${label}</button>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div class="tb-sep"></div>
      <div class="notes-ctrl-wrap tb-fontsize-wrap">
        <button class="tb-btn tb-fs-btn" data-fs-step="-1" title="Decrease font size">−</button>
        <button class="tb-btn tb-fs-num" id="tb-fs-num" data-dd-toggle title="Font size">16</button>
        <button class="tb-btn tb-fs-btn" data-fs-step="1" title="Increase font size">+</button>
        <div class="notes-dropdown tb-fs-dd" id="tb-fs-dd">
          ${NOTE_FONT_SIZE_PRESETS.map(s => `<button data-fs-preset="${s}">${s}</button>`).join('')}
        </div>
      </div>
      <div class="tb-sep"></div>
      <div style="display:flex;align-items:center;gap:2px">
        <button class="tb-btn tb-btn-b" data-cmd="bold"      title="Bold">B</button>
        <button class="tb-btn tb-btn-i" data-cmd="italic"    title="Italic">I</button>
        <button class="tb-btn tb-btn-u" data-cmd="underline" title="Underline">U</button>
      </div>
      <div class="tb-sep"></div>
      <div style="display:flex;align-items:center;gap:2px">
        <button class="tb-btn tb-icon-btn" data-cmd="insertUnorderedList" title="Bullet list">${ICON_BULLET_LIST}</button>
        <button class="tb-btn tb-icon-btn" data-cmd="insertOrderedList"   title="Numbered list">${ICON_NUMBERED_LIST}</button>
      </div>
      <div class="tb-sep"></div>
      <div class="notes-ctrl-wrap tb-color-wrap">
        <button class="tb-btn tb-color-btn" id="tb-color-btn" data-dd-toggle title="Text color">
          <span class="tb-color-icon" id="tb-color-icon">A</span>
        </button>
        <div class="notes-dropdown tb-swatches-dd" id="tb-color-dd">
          <div class="tb-swatches">
            ${NOTE_TEXT_COLORS.map(c => `<div class="sw" data-text-color="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="notes-ctrl-wrap tb-color-wrap">
        <button class="tb-btn tb-hilite-btn" id="tb-hilite-btn" data-dd-toggle title="Highlight color">
          <span class="tb-hilite-icon" id="tb-hilite-icon">A</span>
        </button>
        <div class="notes-dropdown tb-swatches-dd" id="tb-hilite-dd">
          <div class="tb-swatches">
            ${NOTE_HILITE_COLORS.map(c => `<div class="sw" data-hilite-color="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="tb-sep"></div>
      <button class="tb-btn" id="tb-table-btn" title="Insert table">⊞</button>
    </div>
    <div class="note-content" id="note-content" contenteditable="true"
      data-placeholder="Start writing...">${n.content || ''}</div>
  `;
}

function initHeadingCollapse(editorEl) {
  const collapsed = new Map(); // heading element → Set of hidden siblings

  function rebuildToggles() {
    editorEl.querySelectorAll('.hd-toggle').forEach(t => t.remove());
    Array.from(editorEl.children).forEach(block => {
      const tag = block.tagName?.toLowerCase();
      if (!['h1','h2','h3'].includes(tag)) return;
      const toggle = document.createElement('span');
      toggle.className = 'hd-toggle' + (collapsed.has(block) ? ' collapsed' : '');
      toggle.textContent = '▼';
      toggle.contentEditable = 'false';
      toggle.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (collapsed.has(block)) {
          collapsed.get(block).forEach(el => el.style.removeProperty('display'));
          collapsed.delete(block);
          toggle.classList.remove('collapsed');
        } else {
          const level = parseInt(tag[1]);
          const hidden = new Set();
          let next = block.nextElementSibling;
          while (next) {
            const nt = next.tagName?.toLowerCase();
            if (['h1','h2','h3'].includes(nt) && parseInt(nt[1]) <= level) break;
            next.style.display = 'none';
            hidden.add(next);
            next = next.nextElementSibling;
          }
          if (hidden.size) { collapsed.set(block, hidden); toggle.classList.add('collapsed'); }
        }
      });
      block.prepend(toggle);
    });
  }

  rebuildToggles();
  const obs = new MutationObserver(() => rebuildToggles());
  obs.observe(editorEl, { childList: true });
  return obs;
}

function renderNotes() {
  return state.activeNoteId !== null ? renderNoteEditor() : renderNotesList();
}

/* ---- NOTE TABLE HELPERS ---- */
function buildNoteTableHTML(headers, rows) {
  const ths = headers.map(h => `<th contenteditable="true">${escapeHtml(h)}</th>`).join('');
  const trs = rows.map(row =>
    `<tr>${row.map(c => `<td contenteditable="true">${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('');
  return `<div class="note-table-wrapper"><table class="note-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div><p><br></p>`;
}

function addDeleteRowBtn(tr, saveCallback) {
  if (tr.querySelector('.delete-row-btn')) return;
  const lastTd = tr.cells[tr.cells.length - 1];
  if (!lastTd) return;
  const btn = document.createElement('button');
  btn.className = 'delete-row-btn';
  btn.contentEditable = 'false';
  btn.innerHTML = ICON_TRASH;
  btn.title = 'Delete row';
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const tbody = tr.closest('tbody');
    if (!tbody) return;
    if (tbody.querySelectorAll('tr').length <= 1) { showToast('Cannot delete the only row', 'error'); return; }
    tr.remove();
    if (saveCallback) saveCallback();
  });
  lastTd.appendChild(btn);
}

/*
 * Duplicate table UI investigation (5 questions):
 *
 * Q1. Where is initTableInteractions called?
 *   1. setTimeout(..., 60) on editor open — processes all existing tables.
 *   2. Immediately after the toolbar "insert table" button's execCommand.
 *   3. Immediately after the paste handler inserts an HTML table via execCommand.
 *   4. Immediately after the paste handler converts and inserts a markdown table.
 *
 * Q2. How many times can it run for the same table?
 *   Each call scans ALL .note-table-wrapper elements in the editor, not just the
 *   newly-inserted one. So every pre-existing table is re-processed on every
 *   toolbar insert or paste — up to 4 times across a single editing session.
 *
 * Q3. Does autosave reset innerHTML and trigger re-init?
 *   NO. triggerNoteSave works on a deep clone (cloneNode(true)), strips UI
 *   elements from the clone, and only writes contentClone.innerHTML to n.content
 *   (in-memory). The live noteContentEl DOM is never modified. Autosave is not
 *   the cause.
 *
 * Q4. Does the MutationObserver trigger re-init?
 *   NO. initHeadingCollapse observes editorEl with { childList: true } and fires
 *   rebuildToggles() when direct children change (e.g. when insertBefore wraps a
 *   table). rebuildToggles() only rebuilds heading-collapse spans; it never calls
 *   initTableInteractions.
 *
 * Q5. Are there multiple code paths that all call init?
 *   YES — see Q1. Each path processes the whole editor, so any table that already
 *   has buttons will pass through the function again. The per-element querySelector
 *   guards (delete-table-btn, table-toolbar, delete-row-btn) should block double
 *   insertion in theory, but they are fragile: document.execCommand('insertHTML')
 *   fires a synchronous input event that can trigger intermediate render work before
 *   all guards are in place, depending on browser and contenteditable state.
 *
 * Fix: check for actual DOM presence of .table-toolbar instead of dataset flag.
 * dataset.initialized is set on a specific DOM node object — if that node is ever
 * replaced (e.g. execCommand rebuilds the wrapper), the new node has no flag and
 * the guard is bypassed. querySelector checks real DOM state and survives replacement.
 *
 * Call sites for initTableInteractions (do not add new ones without updating this list):
 *   ~line 2572 — setTimeout 60ms on editor open (processes all existing tables)
 *   ~line 2586 — toolbar "insert table" button mousedown (processes whole editor)
 *   ~line 2639 — paste handler after HTML table execCommand insert
 *   ~line 2653 — paste handler after markdown table execCommand insert
 *
 * Call sites for addDeleteRowBtn:
 *   ~line 1196 — addRowBtn.mousedown inside initTableInteractions (new row)
 *   ~line 1225 — addColBtn.mousedown inside initTableInteractions (new last-col td)
 *   ~line 1238 — forEach existing tbody rows inside initTableInteractions
 *   ~line 2620 — Tab keydown handler (new row on Tab from last cell)
 */
function initTableInteractions(editorEl, saveCallback) {
  editorEl.querySelectorAll('.note-table-wrapper').forEach(wrapper => {
    // Wrap in .table-wrapper if not already done
    if (!wrapper.parentElement || !wrapper.parentElement.classList.contains('table-wrapper')) {
      const outer = document.createElement('div');
      outer.className = 'table-wrapper';
      wrapper.parentNode.insertBefore(outer, wrapper);
      outer.appendChild(wrapper);
    }
    const tableWrapper = wrapper.parentElement;

    // Re-apply contenteditable on all cells: browser can strip the attribute when
    // the note HTML is re-parsed via innerHTML, leaving cells non-focusable.
    wrapper.querySelectorAll('th, td').forEach(cell => { cell.contentEditable = 'true'; });

    // Guard: bail if toolbar already exists in DOM — survives node replacement unlike dataset
    if (tableWrapper.querySelector('.table-toolbar')) return;

    // Add delete-table-btn
    if (!tableWrapper.querySelector('.delete-table-btn')) {
      const delTableBtn = document.createElement('button');
      delTableBtn.className = 'delete-table-btn';
      delTableBtn.contentEditable = 'false';
      delTableBtn.textContent = '🗑 Delete table';
      delTableBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        showConfirmModal({
          title: 'Delete Table?',
          message: 'This will permanently remove the entire table from your note.',
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: () => { tableWrapper.remove(); if (saveCallback) saveCallback(); }
        });
      });
      tableWrapper.appendChild(delTableBtn);
    }

    // Add table toolbar (add-row + add-col)
    if (!tableWrapper.querySelector('.table-toolbar')) {
      const toolbar = document.createElement('div');
      toolbar.className = 'table-toolbar';
      toolbar.contentEditable = 'false';

      const addRowBtn = document.createElement('button');
      addRowBtn.className = 'tbl-btn';
      addRowBtn.contentEditable = 'false';
      addRowBtn.textContent = '+ Add row';
      addRowBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const table = wrapper.querySelector('table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        const colCount = table.rows[0]?.cells.length || 3;
        const newRow = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
          const td = document.createElement('td');
          td.contentEditable = 'true';
          newRow.appendChild(td);
        }
        tbody.appendChild(newRow);
        addDeleteRowBtn(newRow, saveCallback);
        newRow.cells[0].focus();
        if (saveCallback) saveCallback();
      });

      const addColBtn = document.createElement('button');
      addColBtn.className = 'tbl-btn';
      addColBtn.contentEditable = 'false';
      addColBtn.textContent = '+ Add col';
      addColBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const table = wrapper.querySelector('table');
        if (!table) return;
        const thead = table.querySelector('thead');
        if (thead) {
          thead.querySelectorAll('tr').forEach(tr => {
            const th = document.createElement('th');
            th.contentEditable = 'true';
            tr.appendChild(th);
          });
        }
        const tbody = table.querySelector('tbody');
        if (tbody) {
          tbody.querySelectorAll('tr').forEach(tr => {
            const existingBtn = tr.querySelector('.delete-row-btn');
            if (existingBtn) existingBtn.remove();
            const td = document.createElement('td');
            td.contentEditable = 'true';
            tr.appendChild(td);
            addDeleteRowBtn(tr, saveCallback);
          });
        }
        if (saveCallback) saveCallback();
      });

      toolbar.appendChild(addRowBtn);
      toolbar.appendChild(addColBtn);
      tableWrapper.appendChild(toolbar);
    }

    // Add delete-row-btn to existing tbody rows
    const tbody = wrapper.querySelector('tbody');
    if (tbody) tbody.querySelectorAll('tr').forEach(tr => addDeleteRowBtn(tr, saveCallback));
  });
}

function sanitizePastedHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('style, meta, link, script').forEach(el => el.remove());
  tmp.querySelectorAll('[style]').forEach(el => {
    el.style.removeProperty('background');
    el.style.removeProperty('background-color');
    el.style.removeProperty('background-image');
    el.style.removeProperty('color');
    if (!el.getAttribute('style').trim()) el.removeAttribute('style');
  });
  tmp.querySelectorAll('[bgcolor]').forEach(el => el.removeAttribute('bgcolor'));
  tmp.querySelectorAll('font[color]').forEach(el => el.removeAttribute('color'));
  return tmp.innerHTML;
}

function convertPastedTable(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const tables = tmp.querySelectorAll('table');
  if (!tables.length) return '';
  let result = '';
  tables.forEach(table => {
    const headers = [];
    const rows = [];
    const thead = table.querySelector('thead');
    if (thead) {
      const headerRow = thead.querySelector('tr');
      if (headerRow) {
        Array.from(headerRow.querySelectorAll('th, td')).forEach(cell => {
          headers.push(cell.textContent.trim());
        });
      }
    }
    const allBodyRows = Array.from(table.querySelectorAll('tr'))
      .filter(row => !row.closest('thead'));
    allBodyRows.forEach((row, i) => {
      if (!thead && i === 0) {
        Array.from(row.querySelectorAll('th, td')).forEach(cell => {
          headers.push(cell.textContent.trim());
        });
        return;
      }
      const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
      if (cells.length) rows.push(cells);
    });
    if (!headers.length) return;
    result += buildNoteTableHTML(headers, rows);
  });
  return result;
}

function convertMarkdownTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.includes('|'));
  if (!lines.length) return '';
  const parseRow = line => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const isSep    = line => /^[\|\s\-:]+$/.test(line);
  const headers  = parseRow(lines[0]);
  const dataStart = lines.length > 1 && isSep(lines[1]) ? 2 : 1;
  const rows = lines.slice(dataStart).filter(l => !isSep(l)).map(parseRow);
  if (!headers.length) return '';
  return buildNoteTableHTML(headers, rows);
}


/* ---- NOTES: event binding ---- */

function bindNotesEvents() {
  // ---- NOTES ----
  // list view: delete note card
  main.querySelectorAll('[data-del-note-card]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.delNoteCard;
    const note = state.notes.find(n => n.id === id);
    const noteTitle = note?.title || 'Untitled';
    showConfirmModal({
      title: 'Delete Note?',
      message: `This will permanently delete "${noteTitle}". This cannot be undone.`,
      onConfirm: () => {
        const card = main.querySelector(`.note-card[data-open-note="${id}"]`);
        state.notes = state.notes.filter(n => n.id !== id);
        if (state.activeNoteId === id) state.activeNoteId = null;
        if (card) card.remove();
        dbCall(() => sb.from('notes').delete().eq('id', id));
      }
    });
  }));

  // list view: relative timestamp refresh
  if (main.querySelector('[data-note-ts]')) {
    notesTimestampIntervalId = setInterval(() => {
      main.querySelectorAll('[data-note-ts]').forEach(el => {
        const note = state.notes.find(n => n.id === el.dataset.noteTs);
        if (note) el.textContent = relativeTime(note.updated_at || note.created_at);
      });
    }, 60000);
  }

  // list view: open note
  main.querySelectorAll('[data-open-note]').forEach(el => el.addEventListener('click', () => {
    state.activeNoteId = el.dataset.openNote;
    render();
  }));

  // list view: new note
  const addNoteBtn = main.querySelector('#add-note-btn');
  if (addNoteBtn) addNoteBtn.addEventListener('click', async () => {
    const now = new Date().toISOString();
    const { data } = await dbCall(() =>
      sb.from('notes').insert({ user_id: currentUser.id, title: '', content: '', updated_at: now }).select().single()
    );
    if (data) {
      state.notes.unshift({ id: data.id, title: '', content: '', created_at: data.created_at, updated_at: data.updated_at || now });
      state.activeNoteId = data.id;
      render();
    }
  });

  // list view: sort dropdown
  const sortBtn = main.querySelector('#notes-sort-btn');
  const sortDd  = main.querySelector('#notes-sort-dd');
  if (sortBtn && sortDd) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortDd.classList.toggle('open');
      main.querySelector('#notes-filter-dd')?.classList.remove('open');
    });
    sortDd.querySelectorAll('[data-sort]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.notesSort = btn.dataset.sort;
      sortDd.classList.remove('open');
      render();
    }));
  }

  // list view: filter dropdown
  const filterBtn = main.querySelector('#notes-filter-btn');
  const filterDd  = main.querySelector('#notes-filter-dd');
  if (filterBtn && filterDd) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterDd.classList.toggle('open');
      main.querySelector('#notes-sort-dd')?.classList.remove('open');
    });
    filterDd.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.notesFilter = btn.dataset.filter;
      filterDd.classList.remove('open');
      render();
    }));
  }

  // list view: grid/list toggle
  const viewBtn = main.querySelector('#notes-view-btn');
  if (viewBtn) viewBtn.addEventListener('click', () => {
    state.notesDisplay = state.notesDisplay === 'grid' ? 'list' : 'grid';
    render();
  });

  // editor: back
  const noteBackBtn = main.querySelector('#note-back-btn');
  if (noteBackBtn) noteBackBtn.addEventListener('click', () => {
    state.activeNoteId = null;
    render();
  });

  // editor: delete
  const noteDelBtn = main.querySelector('#note-del-btn');
  if (noteDelBtn) noteDelBtn.addEventListener('click', () => {
    const id = state.activeNoteId;
    const note = state.notes.find(n => n.id === id);
    const noteTitle = note?.title || 'Untitled';
    showConfirmModal({
      title: 'Delete Note?',
      message: `This will permanently delete "${noteTitle}". This cannot be undone.`,
      onConfirm: () => {
        state.notes = state.notes.filter(n => n.id !== id);
        state.activeNoteId = null;
        render();
        dbCall(() => sb.from('notes').delete().eq('id', id));
      }
    });
  });

  // editor: autosave (title + content, debounced 1000ms)
  const noteTitleEl   = main.querySelector('#note-title');
  const noteContentEl = main.querySelector('#note-content');
  const noteSavedLbl  = main.querySelector('#note-saved-lbl');
  let noteSaveTimer = null;
  const triggerNoteSave = () => {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(async () => {
      const id = state.activeNoteId;
      if (!id) return;
      const n = state.notes.find(x => x.id === id);
      if (!n || !noteTitleEl || !noteContentEl) return;
      n.title = noteTitleEl.value;
      const contentClone = noteContentEl.cloneNode(true);
      contentClone.querySelectorAll('.hd-toggle').forEach(t => t.remove());
      contentClone.querySelectorAll('.note-table-add-row').forEach(t => t.remove());
      contentClone.querySelectorAll('.table-toolbar').forEach(t => t.remove());
      contentClone.querySelectorAll('.delete-row-btn').forEach(t => t.remove());
      contentClone.querySelectorAll('.delete-table-btn').forEach(t => t.remove());
      contentClone.querySelectorAll('.table-wrapper').forEach(outer => {
        const inner = outer.querySelector('.note-table-wrapper');
        if (inner && outer.parentNode) outer.parentNode.replaceChild(inner, outer);
      });
      n.content = contentClone.innerHTML;
      n.updated_at = new Date().toISOString();
      if (noteSavedLbl) {
        noteSavedLbl.classList.add('show');
        setTimeout(() => noteSavedLbl.classList.remove('show'), 2000);
      }
      await dbCall(() => sb.from('notes').update({
        title: n.title, content: n.content, updated_at: n.updated_at
      }).eq('id', id));
    }, 1000);
  };
  if (noteTitleEl)   noteTitleEl.addEventListener('input', triggerNoteSave);
  if (noteContentEl) noteContentEl.addEventListener('input', triggerNoteSave);

  // editor: toolbar
  const getSelectionEl = () => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !noteContentEl || !noteContentEl.contains(sel.anchorNode)) return null;
    return sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
  };
  const updateTbState = () => {
    if (!noteContentEl) return;
    const isBold      = document.queryCommandState('bold');
    const isItalic    = document.queryCommandState('italic');
    const isUnderline = document.queryCommandState('underline');
    const isList      = document.queryCommandState('insertUnorderedList');
    const isOList     = document.queryCommandState('insertOrderedList');
    const block       = (document.queryCommandValue('formatBlock') || '').toLowerCase().trim();
    main.querySelectorAll('.tb-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      let on = false;
      if (cmd === 'bold')                     on = isBold;
      else if (cmd === 'italic')              on = isItalic;
      else if (cmd === 'underline')           on = isUnderline;
      else if (cmd === 'insertUnorderedList') on = isList;
      else if (cmd === 'insertOrderedList')   on = isOList;
      btn.classList.toggle('tb-active', on);
    });
    const normBlock = (!block || block === 'div' || block === 'normal') ? 'p' : block;
    const styleLabel = main.querySelector('#tb-style-label');
    if (styleLabel) {
      const found = NOTE_STYLE_OPTIONS.find(o => o.val === normBlock);
      styleLabel.textContent = found ? found.label : 'Normal Text';
    }
    main.querySelectorAll('#tb-style-dd [data-block]').forEach(b => b.classList.toggle('sel', b.dataset.block === normBlock));
    const el = getSelectionEl();
    if (el) {
      const cs = getComputedStyle(el);
      const fontLabel = main.querySelector('#tb-font-label');
      if (fontLabel) {
        const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
        const match = NOTE_FONTS.find(f => f.name.toLowerCase() === fam.toLowerCase());
        fontLabel.textContent = match ? match.name : 'Font';
      }
      const fsNum = main.querySelector('#tb-fs-num');
      if (fsNum) {
        const px = Math.round(parseFloat(cs.fontSize) || 16);
        fsNum.textContent = px;
        fsNum.dataset.px = px;
      }
    }
  };
  main.querySelectorAll('button.tb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep contenteditable focus
      if (!noteContentEl) return;
      document.execCommand(btn.dataset.cmd, false, null);
      setTimeout(updateTbState, 10);
      triggerNoteSave();
    });
  });
  if (noteContentEl) {
    noteContentEl.addEventListener('keyup',   updateTbState);
    noteContentEl.addEventListener('mouseup', updateTbState);
    noteContentEl.addEventListener('focus',   updateTbState);
    // focus the editor on load if content is empty
    if (!noteContentEl.innerHTML.trim()) setTimeout(() => noteContentEl.focus(), 80);
    // collapsible headings
    setTimeout(() => initHeadingCollapse(noteContentEl), 50);
    // table interactions on load
    setTimeout(() => initTableInteractions(noteContentEl, triggerNoteSave), 60);
  }

  // editor: toolbar dropdowns — opened on mousedown (not click) so the
  // contenteditable selection is never collapsed before a menu item is chosen
  const TB_TOP_DD_IDS = ['tb-style-dd', 'tb-font-dd', 'tb-fs-dd', 'tb-color-dd', 'tb-hilite-dd'];
  const closeTopToolbarDropdowns = () => {
    TB_TOP_DD_IDS.forEach(id => main.querySelector('#' + id)?.classList.remove('open'));
    main.querySelector('#tb-style-options-dd')?.classList.remove('open');
    main.querySelectorAll('.tb-weight-list.open').forEach(l => l.classList.remove('open'));
  };
  [['tb-style-btn', 'tb-style-dd'], ['tb-font-btn', 'tb-font-dd'], ['tb-fs-num', 'tb-fs-dd'],
   ['tb-color-btn', 'tb-color-dd'], ['tb-hilite-btn', 'tb-hilite-dd']].forEach(([btnId, ddId]) => {
    const btn = main.querySelector('#' + btnId);
    const dd  = main.querySelector('#' + ddId);
    if (!btn || !dd) return;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasOpen = dd.classList.contains('open');
      closeTopToolbarDropdowns();
      dd.classList.toggle('open', !wasOpen);
    });
  });
  const styleOptBtn = main.querySelector('#tb-style-options-btn');
  const styleOptDd  = main.querySelector('#tb-style-options-dd');
  if (styleOptBtn && styleOptDd) {
    styleOptBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      styleOptDd.classList.toggle('open');
    });
  }

  // editor: style dropdown — block format (Normal/Title/Subtitle/Heading 1-3)
  main.querySelectorAll('#tb-style-dd [data-block]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!noteContentEl) return;
      noteContentEl.focus();
      document.execCommand('formatBlock', false, btn.dataset.block);
      closeTopToolbarDropdowns();
      setTimeout(updateTbState, 10);
      triggerNoteSave();
    });
  });

  // editor: font size — shared apply helper used by stepper, presets, and "use default style"
  const applyFontSize = (px) => {
    if (!noteContentEl) return;
    noteContentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    document.execCommand('fontSize', false, '7');
    noteContentEl.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute('size');
      f.style.fontSize = px + 'px';
    });
    const fsNum = main.querySelector('#tb-fs-num');
    if (fsNum) { fsNum.textContent = px; fsNum.dataset.px = px; }
    triggerNoteSave();
  };
  main.querySelectorAll('.tb-fs-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const fsNum = main.querySelector('#tb-fs-num');
      const cur = parseInt(fsNum?.dataset.px || fsNum?.textContent || '16', 10);
      applyFontSize(Math.max(6, Math.min(200, cur + parseInt(btn.dataset.fsStep, 10))));
    });
  });
  main.querySelectorAll('#tb-fs-dd [data-fs-preset]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyFontSize(parseInt(btn.dataset.fsPreset, 10));
      closeTopToolbarDropdowns();
    });
  });

  // editor: font family — click a font to expand its weight list, apply family+weight together
  // extra: optional { fontSize, color } applied to the same span in one pass —
  // chaining separate applyFontSize/applyForeColor calls after this would fail because
  // replaceWith() detaches the nodes the live selection points at, collapsing it.
  const applyFontFamily = (family, weight, extra) => {
    if (!noteContentEl) return;
    noteContentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    document.execCommand('fontName', false, '__hq_pending__');
    noteContentEl.querySelectorAll('font[face="__hq_pending__"]').forEach(f => {
      const span = document.createElement('span');
      span.style.fontFamily = family;
      if (weight) span.style.fontWeight = weight;
      if (extra?.fontSize) span.style.fontSize = extra.fontSize + 'px';
      if (extra?.color) span.style.color = extra.color;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    if (extra?.fontSize) {
      const fsNum = main.querySelector('#tb-fs-num');
      if (fsNum) { fsNum.textContent = extra.fontSize; fsNum.dataset.px = extra.fontSize; }
    }
    triggerNoteSave();
  };
  main.querySelectorAll('.tb-font-item').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const list = main.querySelector(`.tb-weight-list[data-weight-list="${btn.dataset.fontToggle}"]`);
      const wasOpen = list?.classList.contains('open');
      main.querySelectorAll('.tb-weight-list.open').forEach(l => l.classList.remove('open'));
      if (list) list.classList.toggle('open', !wasOpen);
    });
  });
  main.querySelectorAll('.tb-weight-list [data-font]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fontDef = NOTE_FONTS.find(f => f.name === btn.dataset.font);
      if (!fontDef) return;
      applyFontFamily(fontDef.family, btn.dataset.weight);
      const label = main.querySelector('#tb-font-label');
      if (label) label.textContent = fontDef.name;
      closeTopToolbarDropdowns();
    });
  });

  // editor: text color / highlight color
  const applyForeColor = (hex) => {
    if (!noteContentEl) return;
    noteContentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    document.execCommand('foreColor', false, hex);
    const icon = main.querySelector('#tb-color-icon');
    if (icon) icon.style.borderBottomColor = hex;
    triggerNoteSave();
  };
  const applyHiliteColor = (hex) => {
    if (!noteContentEl) return;
    noteContentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    let ok = false;
    try { ok = document.execCommand('hiliteColor', false, hex); } catch (_) {}
    if (!ok) { try { document.execCommand('backColor', false, hex); } catch (_) {} }
    const icon = main.querySelector('#tb-hilite-icon');
    if (icon) icon.style.background = hex;
    triggerNoteSave();
  };
  main.querySelectorAll('#tb-color-dd [data-text-color]').forEach(sw => {
    sw.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyForeColor(sw.dataset.textColor);
      closeTopToolbarDropdowns();
    });
  });
  main.querySelectorAll('#tb-hilite-dd [data-hilite-color]').forEach(sw => {
    sw.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyHiliteColor(sw.dataset.hiliteColor);
      closeTopToolbarDropdowns();
    });
  });

  // editor: style options — save / use / reset personal default style
  main.querySelectorAll('#tb-style-options-dd [data-style-action]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!noteContentEl) return;
      const action = btn.dataset.styleAction;
      closeTopToolbarDropdowns();
      if (action === 'save') {
        const el = getSelectionEl() || noteContentEl;
        const cs = getComputedStyle(el);
        const style = {
          fontFamily: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(),
          fontSize: Math.round(parseFloat(cs.fontSize) || 16),
          fontWeight: cs.fontWeight,
          color: rgbToHex(cs.color)
        };
        state.profile.noteDefaultStyle = style;
        if (currentUser) dbCall(() => sb.from('profiles').update({ note_default_style: style }).eq('id', currentUser.id));
        showToast('Default style saved');
      } else if (action === 'use') {
        const style = state.profile.noteDefaultStyle;
        if (!style) { showToast('No default style saved yet', 'error'); return; }
        noteContentEl.focus();
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { showToast('Select some text first', 'error'); return; }
        if (style.fontFamily) {
          applyFontFamily(style.fontFamily, style.fontWeight, { fontSize: style.fontSize, color: style.color });
        } else {
          if (style.fontSize) applyFontSize(style.fontSize);
          if (style.color)    applyForeColor(style.color);
        }
      } else if (action === 'reset') {
        noteContentEl.focus();
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { showToast('Select some text first', 'error'); return; }
        document.execCommand('removeFormat');
        triggerNoteSave();
      }
    });
  });

  // editor: table insert button
  const tbTableBtn = main.querySelector('#tb-table-btn');
  if (tbTableBtn && noteContentEl) {
    tbTableBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      noteContentEl.focus();
      // If cursor is inside a table cell, move it after the table wrapper first —
      // otherwise execCommand inserts the new table nested inside the cell, causing
      // initTableInteractions to produce a separate toolbar for each and "double" buttons.
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const anchor = sel.anchorNode;
        const cell = (anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor)?.closest?.('td, th');
        if (cell) {
          const outerEl = cell.closest('.table-wrapper') || cell.closest('.note-table-wrapper');
          if (outerEl && outerEl.parentNode) {
            try {
              const r = document.createRange();
              r.setStartAfter(outerEl);
              r.collapse(true);
              sel.removeAllRanges();
              sel.addRange(r);
            } catch (_) {}
          }
        }
      }
      const html = buildNoteTableHTML(
        ['Header 1', 'Header 2', 'Header 3'],
        [['Cell', 'Cell', 'Cell'], ['Cell', 'Cell', 'Cell']]
      );
      document.execCommand('insertHTML', false, html);
      initTableInteractions(noteContentEl, triggerNoteSave);
      triggerNoteSave();
    });
  }

  // editor: Tab key navigation inside table cells + cell deletion protection
  if (noteContentEl) {
    noteContentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const cell = e.target.closest ? e.target.closest('td, th') : null;
        if (cell && cell.innerText.trim() === '') {
          e.preventDefault();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const cell = e.target.closest ? e.target.closest('td[contenteditable], th[contenteditable]') : null;
      if (!cell) return;
      e.preventDefault();
      const table = cell.closest('table');
      const cells = Array.from(table.querySelectorAll('th[contenteditable], td[contenteditable]'));
      const idx = cells.indexOf(cell);
      if (idx < cells.length - 1) {
        cells[idx + 1].focus();
      } else {
        const tbody = table.querySelector('tbody');
        const colCount = table.rows[0]?.cells.length || 3;
        const newRow = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
          const td = document.createElement('td');
          td.contentEditable = 'true';
          newRow.appendChild(td);
        }
        tbody.appendChild(newRow);
        addDeleteRowBtn(newRow, triggerNoteSave);
        newRow.cells[0].focus();
        triggerNoteSave();
      }
    });
  }

  // editor: paste handler — convert HTML/markdown tables
  if (noteContentEl) {
    noteContentEl.addEventListener('paste', (e) => {
      if (e.target.closest && e.target.closest('td, th')) return;
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (html && /<table/i.test(html)) {
        e.preventDefault();
        const converted = convertPastedTable(html);
        if (converted) {
          const tablesBefore = new Set(noteContentEl.querySelectorAll('.note-table'));
          document.execCommand('insertHTML', false, converted);
          initTableInteractions(noteContentEl, triggerNoteSave);
          const newTable = Array.from(noteContentEl.querySelectorAll('.note-table')).find(t => !tablesBefore.has(t));
          if (newTable) {
            const firstCell = newTable.querySelector('th[contenteditable], td[contenteditable]');
            if (firstCell) setTimeout(() => firstCell.focus(), 0);
          }
          triggerNoteSave();
        }
      } else if (text && text.trimStart().startsWith('|')) {
        e.preventDefault();
        const converted = convertMarkdownTable(text);
        if (converted) {
          const tablesBefore = new Set(noteContentEl.querySelectorAll('.note-table'));
          document.execCommand('insertHTML', false, converted);
          initTableInteractions(noteContentEl, triggerNoteSave);
          const newTable = Array.from(noteContentEl.querySelectorAll('.note-table')).find(t => !tablesBefore.has(t));
          if (newTable) {
            const firstCell = newTable.querySelector('th[contenteditable], td[contenteditable]');
            if (firstCell) setTimeout(() => firstCell.focus(), 0);
          }
          triggerNoteSave();
        }
      } else if (html) {
        e.preventDefault();
        const cleaned = sanitizePastedHtml(html);
        document.execCommand('insertHTML', false, cleaned);
        triggerNoteSave();
      }
    });
  }
}

