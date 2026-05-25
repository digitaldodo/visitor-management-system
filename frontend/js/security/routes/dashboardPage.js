export function render() {
  return `
    <section class="security-route security-route--dashboard" data-page-route="dashboard">
      <section class="metric-grid" id="metric-grid" aria-label="Security metrics"></section>

      <section class="security-dashboard-band">
        <article class="panel security-alert-summary">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Emergency alerts</p>
              <h2>Operational Status</h2>
            </div>
            <a class="button button--ghost" href="/security/emergency">Open emergency</a>
          </div>
          <div class="emergency-alert-card" id="emergency-alert-card">
            <div>
              <p class="eyebrow">Current state</p>
              <h3 id="emergency-alert-title">Emergency operations clear</h3>
              <p id="emergency-alert-body">No active lockdown, evacuation, or panic alert.</p>
            </div>
            <span class="status-badge status-badge--tone-info" id="emergency-lockdown-state">Clear</span>
          </div>
        </article>

        <article class="panel security-dashboard-actions">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Quick actions</p>
              <h2>Guard Workspace</h2>
            </div>
          </div>
          <div class="quick-action-grid">
            <a class="quick-action" href="/security/scanner"><strong>Scan QR</strong><span>Verify a visitor badge and record movement</span></a>
            <a class="quick-action" href="/security/checkins"><strong>Check-in desk</strong><span>Review visitor and workforce movement</span></a>
            <a class="quick-action" href="/security/visitors"><strong>Visitor operations</strong><span>Search, register, and manage active visitors</span></a>
            <a class="quick-action" href="/security/incidents"><strong>Report incident</strong><span>Flag visitor or workforce security events</span></a>
          </div>
        </article>
      </section>

      <section class="portal-grid security-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Active visitors</p>
              <h2>Currently Inside</h2>
            </div>
            <a class="button button--ghost" href="/security/visitors">View all</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-active-visitors"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Pending approvals</p>
              <h2>Attention Queue</h2>
            </div>
            <a class="button button--ghost" href="/security/approvals">Open approvals</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-pending-approvals"></div>
        </article>
      </section>

      <section class="portal-grid security-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Check-in activity</p>
              <h2>Recent Movement</h2>
            </div>
            <a class="button button--ghost" href="/security/checkins">Manage</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-checkin-activity"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Operational summaries</p>
              <h2>Shift Snapshot</h2>
            </div>
          </div>
          <div class="employee-summary-list" id="security-dashboard-summary"></div>
        </article>
      </section>
    </section>
  `;
}
