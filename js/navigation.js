/* =========================================================
   NAVIGATION — setActiveTab, ROUTES, render, initGlobalBindings
========================================================= */
function setActiveTab(tab) {
  state.activeTab = tab;
  saveUIPrefs();
  render();
}

const ROUTES = {
  'life:home': renderLifeHome,
  'life:schedule': renderSchedule,
  'life:commitments': renderCommitments,
  'life:projects': renderProjects,
  'life:notes': renderNotes,
  'finance:overview': renderFinanceOverview,
  'finance:income': renderIncome,
  'finance:spending': renderSpending,
  'finance:debts': renderDebts
};

function render() {
  const tab = state.activeTab in ROUTES ? state.activeTab : 'life:home';
  const section = tab.split(':')[0];
  main.innerHTML = ROUTES[tab]();
  bindMainEvents();
  animateNumbers();
  animateComplianceRing();
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.go === tab));
  document.querySelectorAll('.bottom-nav .main-tab-btn').forEach(el => el.classList.toggle('active', el.dataset.mainTab === section));
}

/* =========================================================
   GLOBAL NAV BINDINGS (sidebar + bottom nav)
   — called once after app is shown
========================================================= */
function initGlobalBindings() {
  document.querySelectorAll('.sidebar .nav-item').forEach(el => {
    el.addEventListener('click', () => setActiveTab(el.dataset.go));
  });
  document.querySelectorAll('.bottom-nav .main-tab-btn').forEach(el => {
    el.addEventListener('click', () => {
      const firstTab = el.dataset.mainTab === 'finance' ? 'finance:overview' : 'life:home';
      setActiveTab(firstTab);
    });
  });
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (sidebar && toggleBtn) {
    if (localStorage.getItem('hq.sidebar') === 'collapsed') {
      sidebar.classList.add('collapsed');
      toggleBtn.textContent = '»';
    }
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed');
      toggleBtn.textContent = isCollapsed ? '»' : '«';
      localStorage.setItem('hq.sidebar', isCollapsed ? 'collapsed' : 'expanded');
    });
  }
  document.getElementById('sidebar-logout-btn')?.addEventListener('click', signOut);

  const tooltip = document.getElementById('nav-tooltip');
  const tooltipTargets = document.querySelectorAll('.sidebar .nav-item[data-tooltip], .sidebar-signout[data-tooltip]');
  if (tooltip) {
    tooltipTargets.forEach(el => {
      el.addEventListener('mouseenter', () => {
        const sb = document.getElementById('sidebar');
        if (!sb || !sb.classList.contains('collapsed')) return;
        const rect = el.getBoundingClientRect();
        tooltip.textContent = el.dataset.tooltip;
        tooltip.style.top = (rect.top + rect.height / 2) + 'px';
        tooltip.style.left = (rect.right + 6) + 'px';
        tooltip.style.transform = 'translateY(-50%)';
        tooltip.classList.add('visible');
      });
      el.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }
}
