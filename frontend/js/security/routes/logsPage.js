export function render() {
  return `
    <section class="security-route logs-page" data-page-route="logs">
      <section class="portal-grid">
        <article class="panel" id="workforce-logs" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Security logs</p>
              <h2>Workforce Presence Logs</h2>
            </div>
          </div>
          <div class="work-list" id="employee-attendance-log-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Visitor logs</p>
              <h2>Checked-out Visitors</h2>
            </div>
            <span class="status-badge status-badge--checked-out" id="monitor-count-checkedout">0</span>
          </div>
          <div class="work-list" id="monitor-checkedout-list"></div>
        </article>
      </section>

      <section id="security-report-export-target"></section>
    </section>
  `;
}
