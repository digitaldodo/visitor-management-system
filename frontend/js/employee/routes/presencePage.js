export function render() {
  return `
    <section class="employee-route" data-page-route="presence">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Access presence</p>
            <h2>Presence</h2>
            <p class="panel__lede">Attendance, shifts, workplace presence, and check-in history stay focused here.</p>
          </div>
        </div>
        <div class="presence-workspace">
          <div class="employee-presence" id="presence-summary"></div>
          <div class="employee-summary-list" id="attendance-summary"></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Check-in history</p>
            <h2>Attendance Timeline</h2>
          </div>
        </div>
        <div class="work-list" id="employee-attendance-list"></div>
      </article>
    </section>
  `;
}
