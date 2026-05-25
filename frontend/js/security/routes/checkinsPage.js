export function render() {
  return `
    <section class="security-route checkins-page" data-page-route="checkins">
      <section class="portal-grid">
        <article class="panel" id="check-in" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Visitor access</p>
              <h2>Check-in / Check-out</h2>
            </div>
          </div>
          <div class="work-list" id="checkins-list"></div>
        </article>

        <article class="panel" id="employee-check-in" data-operational-module>
          <div class="panel__header">
            <div>
              <p class="eyebrow">Workforce access</p>
              <h2>Workforce Check-In</h2>
            </div>
          </div>
          <form class="qr-verify-form" id="employee-qr-form">
            <label class="form-field">
              <span>Employee badge scan</span>
              <input id="employee-qr-input" type="text" autocomplete="off" placeholder="Scan or paste the static employee QR payload" />
            </label>
            <div class="qr-verify-form__actions">
              <button class="button button--ghost" id="employee-qr-camera-button" type="button">Camera Scan</button>
              <button class="button button--primary" type="submit">Scan employee</button>
            </div>
          </form>
          <video class="qr-scan-video is-hidden" id="employee-qr-scan-video" autoplay playsinline muted></video>
          <div id="employee-qr-result"></div>
        </article>
      </section>

      <section class="panel" id="employee-attendance" data-operational-module>
        <div class="panel__header">
          <div>
            <p class="eyebrow">Guard assist</p>
            <h2>Workforce Presence</h2>
          </div>
          <label class="search-field security-monitor-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 18.6-4.2-4.2a7 7 0 1 0-1.4 1.4l4.2 4.2ZM5 10a5 5 0 1 1 5 5 5 5 0 0 1-5-5Z"/></svg>
            <input id="employee-search" type="search" placeholder="Search employee, department, ID" />
          </label>
        </div>
        <div class="work-list" id="employee-directory-list"></div>
      </section>
    </section>
  `;
}
