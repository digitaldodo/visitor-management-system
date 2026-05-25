export function render() {
  return `
    <section class="security-route emergency-page" data-page-route="emergency">
      <article class="panel emergency-panel" id="emergency" data-operational-module>
        <div class="panel__header">
          <div>
            <p class="eyebrow">Emergency actions</p>
            <h2>Emergency Command</h2>
          </div>
        </div>

        <div class="emergency-alert-card" id="emergency-alert-card">
          <div>
            <p class="eyebrow">Emergency Alerts</p>
            <h3 id="emergency-alert-title">Emergency operations clear</h3>
            <p id="emergency-alert-body">No active lockdown, evacuation, or panic alert.</p>
          </div>
          <span class="status-badge status-badge--tone-info" id="emergency-lockdown-state">Clear</span>
        </div>

        <div class="security-emergency-metrics">
          <article class="security-emergency-metric"><span>Active incidents</span><strong id="emergency-active-count">0</strong></article>
          <article class="security-emergency-metric"><span>Panic alerts</span><strong id="emergency-panic-count">0</strong></article>
          <article class="security-emergency-metric"><span>Unaccounted</span><strong id="emergency-unaccounted-count">0</strong></article>
        </div>

        <section class="portal-grid">
          <article class="security-monitor-card">
            <div class="security-monitor-card__header"><div><p class="eyebrow">Panic workflow</p><h3>Dispatch Critical Alert</h3></div></div>
            <form class="emergency-form" id="panic-form">
              <label class="form-field"><span>Checkpoint</span><input name="checkpoint" type="text" maxlength="120" placeholder="Main gate, lobby, dock" value="Main Gate" /></label>
              <label class="form-field"><span>Situation note</span><textarea name="note" maxlength="500" placeholder="Short note for responding operators" required></textarea></label>
              <button class="button button--primary button--danger" type="submit">Dispatch panic alert</button>
            </form>
          </article>

          <article class="security-monitor-card">
            <div class="security-monitor-card__header">
              <div><p class="eyebrow">Evacuation support</p><h3>People Currently Inside</h3></div>
              <div class="emergency-counts">
                <span>Visitors <b id="evacuation-visitor-count">0</b></span>
                <span>Workforce <b id="evacuation-workforce-count">0</b></span>
                <span>Unaccounted <b id="evacuation-unaccounted-count">0</b></span>
              </div>
            </div>
            <div class="work-list" id="evacuation-register-list"></div>
          </article>
        </section>
      </article>
    </section>
  `;
}
