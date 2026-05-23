export function render() {
  return `
    <section class="visitor-route visitor-settings-page" data-page-route="settings">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Account</p>
            <h2>Preferences</h2>
          </div>
        </div>
        <form class="visitor-request-form" id="visitor-settings-form" novalidate>
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
          <fieldset class="settings-fieldset">
            <legend>Optional saved preferences</legend>
            <label class="toggle-row">
              <input name="rememberVisitPreferences" type="checkbox" checked />
              <span>Keep optional visit form preferences</span>
            </label>
          </fieldset>
          <div class="form-actions form-field--wide">
            <button class="button button--primary" type="submit">Save settings</button>
            <button class="button button--ghost" type="button" data-clear-saved-preferences>Clear optional preferences</button>
          </div>
        </form>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Security</p>
            <h2>Password</h2>
          </div>
        </div>
        <form class="visitor-request-form" id="visitor-password-form" novalidate>
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
