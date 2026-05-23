export function render() {
  return `
    <section class="visitor-route visitor-pre-registration-page" data-page-route="pre-registration">
      <article class="panel" id="visitor-pre-registration-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Pre-registration</p>
            <h2>Plan a Visit</h2>
            <p class="panel__lede">Submit the host, arrival timing, contact details, and required identity document before arrival.</p>
          </div>
        </div>
        <form class="visitor-request-form visitor-pre-registration-form" id="visitor-pre-registration-form" novalidate>
          <label class="form-field">
            <span>Phone</span>
            <input name="phone" type="tel" autocomplete="tel" placeholder="+1 555 0100" required />
          </label>
          <label class="form-field">
            <span>Organization</span>
            <input name="companyCode" type="hidden" data-organization-selector data-organization-prefetch="true" data-organization-label="Visit organization" required />
          </label>
          <div class="form-field form-field--wide">
            <span>Host employee</span>
            <div class="host-picker">
              <input data-host-search-input type="text" placeholder="Search employee name, email, or username" autocomplete="off" required />
              <input data-host-id name="hostEmployeeId" type="hidden" />
              <input data-host-name name="hostEmployee" type="hidden" />
              <div class="host-picker__meta" data-host-meta></div>
              <div class="host-picker__results is-hidden" data-host-results></div>
            </div>
          </div>
          <label class="form-field">
            <span>Purpose</span>
            <input name="purposeOfVisit" type="text" placeholder="Purpose of visit" required />
          </label>
          <label class="form-field">
            <span>Visit date</span>
            <input name="visitDate" type="date" required />
          </label>
          <label class="form-field">
            <span>Arrival time</span>
            <input name="arrivalTime" type="time" required />
          </label>
          <label class="form-field">
            <span>Expected duration</span>
            <select name="expectedDurationMinutes">
              <option value="60">1 hour</option>
              <option value="30">30 minutes</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="240">4 hours</option>
              <option value="480">Full day</option>
            </select>
          </label>
          <label class="form-field form-field--wide">
            <span>Identity document photo</span>
            <input name="photoFile" type="file" accept="image/*" capture="user" required />
          </label>
          <p class="form-hint form-field--wide" id="visitor-pre-registration-schedule-hint">Approval status appears after your host reviews the submitted request.</p>
          <button class="button button--primary" type="submit">Submit pre-registration</button>
        </form>
        <div class="pre-registration-success is-hidden" id="visitor-pre-registration-success" aria-live="polite"></div>
      </article>
    </section>
  `;
}
