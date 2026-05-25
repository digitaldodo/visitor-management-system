export function render() {
  return `
    <section class="security-route incidents-page" data-page-route="incidents">
      <section class="portal-grid">
        <article class="panel emergency-panel" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Incident report</p>
              <h2>Visitor Incident</h2>
            </div>
          </div>
          <form class="emergency-form" id="suspicious-visitor-form">
            <label class="form-field"><span>Visitor record ID</span><input name="id" type="text" maxlength="80" placeholder="Paste visitor ID" required /></label>
            <label class="form-field"><span>Checkpoint</span><input name="checkpoint" type="text" maxlength="120" placeholder="Gate or desk location" /></label>
            <label class="form-field"><span>Security note</span><textarea name="note" maxlength="500" placeholder="What was observed?" required></textarea></label>
            <button class="button button--ghost" type="submit">Flag visitor</button>
          </form>
        </article>

        <article class="panel emergency-panel" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Incident report</p>
              <h2>Workforce Incident</h2>
            </div>
          </div>
          <form class="emergency-form" id="suspicious-workforce-form">
            <label class="form-field"><span>Workforce user ID</span><input name="id" type="text" maxlength="80" placeholder="Paste workforce user ID" required /></label>
            <label class="form-field"><span>Checkpoint</span><input name="checkpoint" type="text" maxlength="120" placeholder="Gate or desk location" /></label>
            <label class="form-field"><span>Security note</span><textarea name="note" maxlength="500" placeholder="What was observed?" required></textarea></label>
            <button class="button button--ghost" type="submit">Flag workforce</button>
          </form>
        </article>
      </section>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Incident stream</p>
            <h2>Emergency Feed</h2>
          </div>
          <label class="form-field emergency-filter">
            <span>Filter</span>
            <select id="emergency-incident-filter">
              <option value="ALL">All incidents</option>
              <option value="PANIC_TRIGGERED">Panic</option>
              <option value="SUSPICIOUS_VISITOR">Suspicious visitor</option>
              <option value="SUSPICIOUS_WORKFORCE">Suspicious workforce</option>
              <option value="CRITICAL">Critical</option>
              <option value="ACTIVE">Active</option>
            </select>
          </label>
        </div>
        <div class="work-list" id="emergency-feed-list"></div>
      </article>
    </section>
  `;
}
