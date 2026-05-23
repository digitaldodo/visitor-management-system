export function render() {
  return `
    <section class="employee-route visitor-request-page" data-page-route="requests">
      <article class="panel" id="approvals">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Action Needed</p>
            <h2>Visitor Approvals</h2>
          </div>
          <button class="button button--primary" type="button" data-refresh-approvals>Review queue</button>
        </div>
        <div class="work-list" id="approvals-list"></div>
      </article>

      <article class="panel" id="pre-approvals">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Planning</p>
            <h2>Schedule Visitor</h2>
          </div>
        </div>
        <form class="preapproval-form" id="preapproval-form" novalidate>
          <label class="form-field">
            <span>Full Name</span>
            <input name="fullName" type="text" autocomplete="name" placeholder="Visitor full name" required />
          </label>
          <label class="form-field">
            <span>Phone</span>
            <input name="phone" type="tel" autocomplete="tel" placeholder="+1 555 0100" required />
          </label>
          <label class="form-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" placeholder="visitor@company.com" />
          </label>
          <label class="form-field form-field--wide">
            <span>Purpose</span>
            <input name="purposeOfVisit" type="text" placeholder="Purpose of visit" required />
          </label>
          <label class="form-field">
            <span>Start</span>
            <input name="scheduledStartTime" type="datetime-local" required />
          </label>
          <label class="form-field">
            <span>End</span>
            <input name="scheduledEndTime" type="datetime-local" required />
          </label>
          <label class="form-field form-field--wide">
            <span>Additional Note for Visitor</span>
            <textarea name="note" maxlength="240" rows="4" placeholder="Parking, gate, reception, room, or personal instructions"></textarea>
          </label>
          <div class="preapproval-form__footer form-field--wide">
            <span id="preapproval-timezone">Timezone detected</span>
            <button class="button button--primary" type="submit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3v18H4V4h3Zm11 8H6v10h12Zm-7 8-3-3 1.4-1.4 1.6 1.6 4.6-4.6L17 12Z"/></svg>
              <span>Pre-approve</span>
            </button>
          </div>
        </form>
      </article>

      <article class="panel" id="visitor-invites">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Pre-registration</p>
            <h2>Visitor Invite Management</h2>
            <p class="panel__lede">Create, share, resend, revoke, and track secure visitor invite links through the same lifecycle used by mobile.</p>
          </div>
        </div>
        <form class="preapproval-form" id="visitor-invite-form" novalidate>
          <label class="form-field">
            <span>Visitor Name</span>
            <input name="visitorName" type="text" autocomplete="name" placeholder="Visitor full name" required />
          </label>
          <label class="form-field">
            <span>Email</span>
            <input name="visitorEmail" type="email" autocomplete="email" placeholder="visitor@company.com" />
          </label>
          <label class="form-field">
            <span>Phone</span>
            <input name="phone" type="tel" autocomplete="tel" placeholder="+1 555 0100" />
          </label>
          <label class="form-field">
            <span>Company</span>
            <input name="companyName" type="text" placeholder="Visitor company" />
          </label>
          <label class="form-field form-field--wide">
            <span>Purpose</span>
            <input name="purposeOfVisit" type="text" placeholder="Purpose of visit" required />
          </label>
          <label class="form-field">
            <span>Arrival</span>
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
          <label class="form-field">
            <span>Invite expiry</span>
            <select name="expiresInHours">
              <option value="72">72 hours</option>
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
              <option value="336">14 days</option>
            </select>
          </label>
          <label class="form-field form-field--wide">
            <span>Visitor note</span>
            <textarea name="note" maxlength="500" rows="3" placeholder="Parking, gate, reception, room, or personal instructions"></textarea>
          </label>
          <div class="preapproval-form__footer form-field--wide">
            <span id="visitor-invite-timezone">Timezone detected</span>
            <button class="button button--primary" type="submit">Create invite</button>
          </div>
        </form>
        <div class="work-list" id="visitor-invite-list"></div>
      </article>

      <article class="panel" id="scheduled">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Calendar</p>
            <h2>Scheduled Visitors</h2>
          </div>
        </div>
        <div class="work-list" id="scheduled-list"></div>
      </article>
    </section>
  `;
}
