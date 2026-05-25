export function render() {
  return `
    <section class="security-route verification-page" data-page-route="verification">
      <section class="portal-grid">
        <article class="panel" id="badges" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Visitor verification</p>
              <h2>Badge and QR</h2>
              <p class="panel__lede">Review approved passes, open badge previews, and confirm visitor identity before entry.</p>
            </div>
          </div>
          <div class="work-list" id="badge-list"></div>
        </article>

        <aside class="panel" id="photo" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Identity</p>
              <h2>Photo Capture</h2>
            </div>
          </div>
          <div class="camera-frame" id="camera-frame-status">Photo capture starts from the desk browser or secure file picker.</div>
          <div class="work-list" id="photo-list"></div>
        </aside>
      </section>
    </section>
  `;
}
