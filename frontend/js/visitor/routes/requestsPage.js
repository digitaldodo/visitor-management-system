export function render() {
  return `
    <section class="visitor-route visitor-requests-page" data-page-route="requests">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Workflow</p>
            <h2>Create Visit Request</h2>
          </div>
          <a class="button button--ghost" href="/visitor/pre-registration">Expanded pre-registration</a>
        </div>
        ${requestFormMarkup("visitor-request-form", "Submit request")}
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Request Pipeline</p>
            <h2>Upcoming, Pending, Denied, and Completed</h2>
          </div>
          <div class="visitor-filter-row" role="group" aria-label="Request filters">
            <button class="filter-chip is-active" type="button" data-request-filter="all">All</button>
            <button class="filter-chip" type="button" data-request-filter="PENDING">Pending</button>
            <button class="filter-chip" type="button" data-request-filter="APPROVED">Approved</button>
            <button class="filter-chip" type="button" data-request-filter="REJECTED">Denied</button>
            <button class="filter-chip" type="button" data-request-filter="CHECKED_OUT">Completed</button>
          </div>
        </div>
        <div class="visitor-request-groups" id="visitor-request-groups"></div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Invites</p>
            <h2>Pre-registration Invites</h2>
          </div>
        </div>
        <div class="work-list visitor-visit-list" id="visitor-invite-list"></div>
      </article>
    </section>
  `;
}

function requestFormMarkup(id, submitLabel) {
  return `
    <form class="visitor-request-form" id="${id}" novalidate>
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
        <span>Visit date and arrival</span>
        <input name="scheduledStartTime" type="datetime-local" required />
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
      <p class="form-hint form-field--wide" id="${id}-schedule-hint">Access opens early and expires after the approved visit window.</p>
      <label class="form-field form-field--wide">
        <span>Visitor photo</span>
        <input name="photoFile" type="file" accept="image/*" capture="user" required />
      </label>
      <button class="button button--primary" type="submit">${submitLabel}</button>
    </form>
  `;
}
