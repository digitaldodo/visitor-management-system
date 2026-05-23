export function render() {
  return `
    <section class="employee-route panel credential-page" id="credential" data-page-route="badge">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Identity Center</p>
          <h2>Badge</h2>
          <p class="panel__lede">Manage your reusable employee badge, static QR, exports, badge status, and profile photo.</p>
        </div>
      </div>
      <div class="credential-layout">
        <article class="credential-preview-card">
          <div id="employee-badge-panel"></div>
          <div class="credential-actions">
            <button class="button button--ghost" type="button" data-own-badge-action="print">Print badge</button>
            <button class="button button--ghost" type="button" data-own-badge-action="png">PNG export</button>
            <button class="button button--primary" type="button" data-own-badge-action="pdf">PDF download</button>
          </div>
        </article>
        <aside class="credential-side">
          <article class="credential-qr-card" id="credential-qr-panel"></article>
          <article class="credential-mobile-card" id="credential-mobile-preview"></article>
          <article class="credential-photo-card">
            <div>
              <p class="eyebrow">Profile Photo</p>
              <h3>Badge Photo</h3>
            </div>
            <form id="credential-photo-form" novalidate>
              <label class="form-field">
                <span>Upload photo</span>
                <input name="profilePhoto" type="file" accept="image/*" />
              </label>
              <div class="danger-zone danger-zone--compact">
                <button class="button button--ghost" type="button" data-profile-remove-photo>Remove photo</button>
                <button class="button button--ghost" type="button" data-revoke-badge-exports>Revoke local exports</button>
              </div>
              <p id="credential-photo-status">Your QR identity remains unchanged when the photo updates.</p>
            </form>
          </article>
        </aside>
      </div>
    </section>
  `;
}
