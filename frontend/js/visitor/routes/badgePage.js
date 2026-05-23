export function render() {
  return `
    <section class="visitor-route visitor-badge-page" data-page-route="badge">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Identity Center</p>
            <h2>Approved QR Badge</h2>
            <p class="panel__lede">Your QR appears only when a visit is approved and still inside the allowed access lifecycle.</p>
          </div>
          <div class="visitor-toolbar">
            <button class="button button--ghost" type="button" data-badge-page-action="print">Print</button>
            <button class="button button--ghost" type="button" data-badge-page-action="png">Download PNG</button>
            <button class="button button--primary" type="button" data-badge-page-action="pdf">Download PDF</button>
          </div>
        </div>
        <div class="visitor-badge-workspace">
          <div class="visitor-badge-workspace__preview" id="visitor-badge-panel"></div>
          <aside class="visitor-badge-workspace__details" id="visitor-badge-details"></aside>
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Approval Context</p>
            <h2>Badge Candidates</h2>
          </div>
        </div>
        <div class="work-list" id="visitor-badge-visits-list"></div>
      </article>
    </section>
  `;
}
