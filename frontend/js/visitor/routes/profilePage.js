export function render() {
  return `
    <section class="visitor-route visitor-profile-page" data-page-route="profile">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Profile Management</p>
            <h2>Visitor Identity</h2>
            <p class="panel__lede">Update contact details and language preferences without changing approval or audit history.</p>
          </div>
        </div>
        <div class="profile-layout">
          <form class="visitor-request-form visitor-profile-form" id="visitor-profile-form" novalidate>
            <label class="form-field">
              <span>Full name</span>
              <input name="fullName" type="text" autocomplete="name" maxlength="120" required />
            </label>
            <label class="form-field">
              <span>Username</span>
              <input name="username" type="text" autocomplete="username" required />
            </label>
            <label class="form-field">
              <span>Phone number</span>
              <input name="phone" type="tel" autocomplete="tel" />
            </label>
            <label class="form-field">
              <span>Emergency contact</span>
              <input name="emergencyContact" type="text" maxlength="160" autocomplete="tel" />
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
            <p class="form-hint form-field--wide" id="visitor-photo-status">Photo updates apply to your visitor account and badge surfaces.</p>
            <div class="form-actions form-field--wide">
              <button class="button button--primary" type="submit">Save profile</button>
              <button class="button button--ghost" type="button" data-profile-remove-photo>Remove photo</button>
            </div>
          </form>
          <aside class="restricted-profile-card" id="visitor-profile-card"></aside>
        </div>
      </article>
    </section>
  `;
}
