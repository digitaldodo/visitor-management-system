export function render() {
  return `
    <section class="security-route approvals-page" data-page-route="approvals">
      <section class="portal-grid">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Visitor verification approvals</p>
              <h2>Visitor Invites</h2>
              <p class="panel__lede">Track invitation state and close or resend pending visitor verification workflows.</p>
            </div>
            <span class="status-badge status-badge--tone-info" id="security-invite-count">0</span>
          </div>
          <div class="work-list" id="security-invite-list"></div>
        </article>

        <article class="panel" id="workforce-submitted-requests" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Workforce approvals</p>
              <h2>Admin Decision Tracker</h2>
            </div>
          </div>
          <div class="work-list" id="workforce-request-list"></div>
        </article>
      </section>

      <section class="panel" id="workforce-onboarding" data-operational-module>
        <div class="panel__header">
          <div>
            <p class="eyebrow">Pending admin approval</p>
            <h2>Submit Workforce Onboarding</h2>
          </div>
        </div>
        <form class="workforce-onboarding-form" id="workforce-onboarding-form" novalidate>
          <label class="form-field"><span>Workforce member name</span><input name="fullName" type="text" autocomplete="name" placeholder="Full name" required /></label>
          <label class="form-field"><span>Username</span><input name="username" type="text" autocomplete="username" placeholder="worker_001" /></label>
          <label class="form-field"><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="workforce@company.com" /></label>
          <label class="form-field"><span>Proposed access role</span><select name="role"><option value="EMPLOYEE">Employee portal</option><option value="SECURITY_GUARD">Security portal</option><option value="RECEPTION">Reception/front desk</option><option value="OPERATOR">Operator</option><option value="MANAGER">Manager</option></select></label>
          <label class="form-field"><span>Phone code</span><input name="phoneCountryCode" type="tel" autocomplete="tel-country-code" placeholder="+1" value="+1" /></label>
          <label class="form-field"><span>Mobile</span><input name="phone" type="tel" autocomplete="tel" placeholder="Optional mobile number" /></label>
          <label class="form-field"><span>Department</span><input name="department" type="text" autocomplete="organization-title" placeholder="Facilities" /></label>
          <label class="form-field"><span>Workforce category</span><select name="employeeType"><option value="CLEANER">Cleaner</option><option value="SWEEPER">Sweeper</option><option value="GARDENER">Gardener</option><option value="HELPER">Helper</option><option value="MAINTENANCE">Maintenance</option><option value="CONTRACT_LABOR">Contract labor</option><option value="SUPPORT_STAFF">Support staff</option></select></label>
          <label class="form-field"><span>Designation</span><input name="designation" type="text" autocomplete="organization-title" placeholder="Housekeeping support" /></label>
          <label class="form-field"><span>Shift name</span><input name="shiftName" type="text" placeholder="Morning Shift" /></label>
          <label class="form-field"><span>Shift start</span><input name="shiftStartTime" type="time" /></label>
          <label class="form-field"><span>Shift end</span><input name="shiftEndTime" type="time" /></label>
          <input name="employeePhotoUrl" type="hidden" />
          <div class="workforce-onboarding-form__photo">
            <button class="button button--ghost" id="workforce-photo-button" type="button">Capture photo</button>
            <span id="workforce-photo-status">Photo optional before admin approval</span>
          </div>
          <div class="admin-user-form__footer">
            <p>Security can submit details and print a receipt. QR and badge access activate only after organization admin approval.</p>
            <button class="button button--primary" type="submit">Submit for approval</button>
          </div>
        </form>
        <div id="workforce-onboarding-result"></div>
      </section>
    </section>
  `;
}
