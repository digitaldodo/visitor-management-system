export function render() {
  return `
    <section class="employee-route employee-route--dashboard" data-page-route="dashboard">
      <section class="metric-grid" id="metric-grid" aria-label="Employee metrics"></section>

      <section class="portal-grid employee-dashboard-grid">
        <article class="panel employee-presence-card">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Current state</p>
              <h2>Presence</h2>
            </div>
            <a class="button button--ghost" href="/employee/presence">Open presence</a>
          </div>
          <div class="employee-presence" id="presence-summary"></div>
        </article>

        <article class="panel dashboard-badge-card">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Reusable Identity</p>
              <h2>Employee Badge</h2>
            </div>
            <a class="button button--ghost" href="/employee/badge">Manage</a>
          </div>
          <div id="dashboard-badge-panel"></div>
        </article>
      </section>

      <section class="portal-grid employee-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Upcoming</p>
              <h2>Visitors</h2>
            </div>
            <a class="button button--primary" href="/employee/requests">Manage</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-upcoming-list"></div>
        </article>
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Recent Approvals</p>
              <h2>Activity Stream</h2>
            </div>
            <a class="button button--ghost" href="/employee/history">History</a>
          </div>
          <div class="work-list work-list--compact" id="recent-activity-list"></div>
        </article>
      </section>

      <section class="portal-grid employee-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Quick Actions</p>
              <h2>Workspace</h2>
            </div>
          </div>
          <div class="quick-action-grid">
            <a class="quick-action" href="/employee/requests"><strong>Review visitors</strong><span>Approve arrivals and timing changes</span></a>
            <a class="quick-action" href="/employee/requests"><strong>Schedule visit</strong><span>Create a pre-approval or invite</span></a>
            <a class="quick-action" href="/employee/badge"><strong>Open credential</strong><span>Export or print your badge</span></a>
            <a class="quick-action" href="/employee/profile"><strong>Update profile</strong><span>Manage identity and preferences</span></a>
          </div>
        </article>
      </section>

      <section class="portal-grid employee-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Notifications</p>
              <h2>Latest Updates</h2>
            </div>
            <a class="button button--ghost" href="/employee/notifications">View all</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-notifications-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Attendance</p>
              <h2>Today Summary</h2>
            </div>
          </div>
          <div class="employee-summary-list" id="attendance-summary"></div>
        </article>
      </section>
    </section>
  `;
}
