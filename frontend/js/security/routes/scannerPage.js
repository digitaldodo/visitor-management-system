export function render() {
  return `
    <section class="security-route scanner-page" data-page-route="scanner">
      <article class="panel qr-scanner-workspace" id="qr" data-operational-module>
        <div class="panel__header">
          <div>
            <p class="eyebrow">QR scanner</p>
            <h2>Visitor Badge Verification</h2>
            <p class="panel__lede">Scan the visitor badge, verify its current approval state, then record check-in or check-out from the result panel.</p>
          </div>
        </div>
        <div class="scanner-layout">
          <div class="scanner-stage">
            <video class="qr-scan-video is-hidden" id="qr-scan-video" autoplay playsinline muted></video>
            <div class="scanner-stage__idle">
              <span aria-hidden="true">QR</span>
              <strong>Ready for camera or hardware scanner</strong>
              <p>Camera permission is requested only when Camera Scan is selected.</p>
            </div>
          </div>
          <form class="qr-verify-form scanner-form" id="qr-verify-form">
            <label class="form-field">
              <span>Badge scan or verification link</span>
              <input id="qr-payload-input" type="text" autocomplete="off" inputmode="url" placeholder="Scan a badge URL or paste the verification link" />
            </label>
            <div class="qr-verify-form__actions">
              <button class="button button--ghost" id="qr-camera-button" type="button">Camera Scan</button>
              <button class="button button--primary" type="submit">Verify</button>
            </div>
          </form>
        </div>
        <div class="scanner-result-grid">
          <div id="qr-result"></div>
          <article class="security-monitor-card">
            <div class="security-monitor-card__header">
              <div>
                <p class="eyebrow">Scan history</p>
                <h3>Recent Check-ins</h3>
              </div>
            </div>
            <div class="work-list work-list--compact" id="checkins-list"></div>
          </article>
        </div>
      </article>
    </section>
  `;
}
