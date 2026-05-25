export function render() {
  return `
    <section class="security-route visitors-page" data-page-route="visitors">
      <section class="panel" id="visitor-registration" data-security-visitors></section>

      <section class="panel" id="monitoring" data-operational-module>
        <div class="panel__header">
          <div>
            <p class="eyebrow">Visitor management</p>
            <h2>Active Visitor Lifecycle</h2>
          </div>
          <label class="search-field security-monitor-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 18.6-4.2-4.2a7 7 0 1 0-1.4 1.4l4.2 4.2ZM5 10a5 5 0 1 1 5 5 5 5 0 0 1-5-5Z"/></svg>
            <input id="monitoring-search" type="search" placeholder="Search visitor, host, company, QR" />
          </label>
        </div>
        <div class="security-monitor-grid">
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">On site</p><h3>Currently Inside</h3></div><span class="status-badge status-badge--checked-in" id="monitor-count-inside">0</span></div>
            <div class="work-list" id="monitor-inside-list"></div>
          </article>
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">Expected arrivals</p><h3>Approved Register</h3></div></div>
            <div class="work-list" id="queue-list"></div>
          </article>
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">Attention</p><h3>Overdue Visitors</h3></div><span class="status-badge status-badge--expired" id="monitor-count-overdue">0</span></div>
            <div class="work-list" id="monitor-overdue-list"></div>
          </article>
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">Denied</p><h3>Denied Visitors</h3></div><span class="status-badge status-badge--rejected" id="monitor-count-rejected">0</span></div>
            <div class="work-list" id="monitor-rejected-list"></div>
          </article>
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">Recurring</p><h3>Active Profiles</h3></div><span class="status-badge status-badge--approved" id="monitor-count-recurring-active">0</span></div>
            <div class="work-list" id="monitor-recurring-active-list"></div>
          </article>
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">Restricted</p><h3>Suspended Visitors</h3></div><span class="status-badge status-badge--suspended" id="monitor-count-suspended">0</span></div>
            <div class="work-list" id="monitor-suspended-list"></div>
          </article>
        </div>
      </section>
    </section>
  `;
}
