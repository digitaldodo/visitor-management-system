export function render() {
  return `
    <section class="employee-route settings-page profile-page" data-page-route="profile">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Profile / Account Settings</p>
            <h2>Employee Profile</h2>
            <p class="panel__lede">Update employee-owned profile details without changing account roles or access policy.</p>
          </div>
        </div>
        <div class="profile-layout">
          <form class="settings-form profile-form" id="employee-profile-form" novalidate>
            <label class="form-field">
              <span>Display name</span>
              <input name="fullName" type="text" autocomplete="name" maxlength="160" />
            </label>
            <label class="form-field">
              <span>Phone number</span>
              <input name="phone" type="tel" autocomplete="tel" />
            </label>
            <label class="form-field">
              <span>Designation</span>
              <input name="designation" type="text" maxlength="120" placeholder="Product manager, engineer, analyst" />
            </label>
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
            <label class="form-field">
              <span>Emergency contact</span>
              <input name="emergencyContact" type="text" maxlength="160" autocomplete="tel" />
            </label>
            <label class="form-field form-field--wide">
              <span>Profile photo</span>
              <input class="profile-upload__input" name="profilePhoto" type="file" accept="image/png,image/jpeg,image/webp" />
              <div class="profile-upload" data-profile-upload-card role="button" tabindex="0" aria-label="Upload profile photo">
                <div class="profile-upload__preview" data-upload-preview><span aria-hidden="true">Upload</span></div>
                <div class="profile-upload__copy">
                  <strong data-upload-title>Upload profile photo</strong>
                  <span data-upload-meta>PNG, JPG, or WebP up to 5MB</span>
                </div>
                <div class="profile-upload__actions">
                  <button class="button button--ghost" type="button" data-upload-replace>Replace</button>
                  <button class="button button--ghost" type="button" data-upload-clear>Clear</button>
                </div>
              </div>
            </label>
            <div class="form-actions form-field--wide">
              <button class="button button--primary" type="submit">Save profile</button>
              <button class="button button--ghost" type="button" data-profile-remove-photo>Remove photo</button>
            </div>
          </form>
          <aside class="restricted-profile-card" id="restricted-profile-card"></aside>
        </div>
      </article>
    </section>
  `;
}
