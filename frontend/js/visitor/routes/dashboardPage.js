export function render() {
  return `
    <section class="visitor-route visitor-route--dashboard" data-page-route="dashboard">
      <section class="metric-grid" id="metric-grid" aria-label="Visitor metrics"></section>

      <section class="portal-grid visitor-dashboard-grid">
        <article class="panel visitor-active-pass-card">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Active QR Status</p>
              <h2>Badge Readiness</h2>
            </div>
            <a class="button button--ghost" href="/visitor/badge">Open badge</a>
          </div>
          <div id="dashboard-badge-status"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Approval Status</p>
              <h2>Upcoming Visits</h2>
            </div>
            <a class="button button--primary" href="/visitor/requests">Manage</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-upcoming-list"></div>
        </article>
      </section>

      <section class="portal-grid visitor-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Quick Actions</p>
              <h2>Visitor Workspace</h2>
            </div>
          </div>
          <div class="quick-action-grid">
            <a class="quick-action" href="/visitor/pre-registration"><strong>Pre-register</strong><span>Plan a visit and submit identity details</span></a>
            <a class="quick-action" href="/visitor/badge"><strong>Show badge</strong><span>Open approved QR access</span></a>
            <a class="quick-action" href="/visitor/history"><strong>Review history</strong><span>Audit prior visits and decisions</span></a>
            <a class="quick-action" href="/visitor/profile"><strong>Update profile</strong><span>Manage contact and language details</span></a>
          </div>
        </article>
      </section>

      <section class="portal-grid visitor-dashboard-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Latest Notifications</p>
              <h2>Visitor Updates</h2>
            </div>
            <a class="button button--ghost" href="/visitor/notifications">View all</a>
          </div>
          <div class="work-list work-list--compact" id="dashboard-notifications-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Recent Activity</p>
              <h2>Timeline</h2>
            </div>
            <a class="button button--ghost" href="/visitor/history">History</a>
          </div>
          <div class="work-list work-list--compact" id="recent-activity-list"></div>
        </article>
      </section>
    </section>
  `;
}
