export function render() {
  return `
    <section class="employee-route settings-page" data-page-route="settings">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Preferences</p>
            <h2>Settings</h2>
            <p class="panel__lede">Notification defaults, optional saved preferences, and password controls stay separate from account identity.</p>
          </div>
        </div>
        <div class="settings-layout settings-layout--single">
          <form class="settings-form" id="employee-settings-form" novalidate>
            <label class="form-field">
              <span>Preferred language</span>
              <select name="preferredLanguage">
                <option value="">Use organization default</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </label>
            <label class="form-field">
              <span>Preferred timezone</span>
              <select name="preferredTimezone">
                <option value="">Use organization timezone</option>
                <option value="UTC">UTC</option>
                <option value="Asia/Kolkata">India Standard Time</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="Europe/London">London</option>
              </select>
            </label>
            <fieldset class="settings-fieldset">
              <legend>Notification preferences</legend>
              <label class="toggle-row">
                <input name="notificationInAppEnabled" type="checkbox" />
                <span>In-app notifications</span>
              </label>
              <label class="toggle-row">
                <input name="notificationEmailEnabled" type="checkbox" />
                <span>Email notifications</span>
              </label>
            </fieldset>
            <div class="form-actions form-field--wide">
              <button class="button button--primary" type="submit">Save settings</button>
              <button class="button button--ghost" type="button" data-clear-preferences>Delete optional preferences</button>
              <button class="button button--ghost" type="button" data-clear-download-cache>Clear cached downloads</button>
            </div>
          </form>
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Security</p>
            <h2>Password</h2>
          </div>
        </div>
        <form class="settings-form settings-form--password" id="employee-password-form" novalidate>
          <label class="form-field">
            <span>Current password</span>
            <input name="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label class="form-field">
            <span>New password</span>
            <input name="newPassword" type="password" autocomplete="new-password" required />
          </label>
          <label class="form-field">
            <span>Confirm new password</span>
            <input name="confirmPassword" type="password" autocomplete="new-password" required />
          </label>
          <button class="button button--primary" type="submit">Update password</button>
        </form>
      </article>
    </section>
  `;
}
