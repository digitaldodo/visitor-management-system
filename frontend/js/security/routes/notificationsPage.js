export function render() {
  return `
    <section class="security-route notifications-page" data-page-route="notifications">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Notifications</p>
            <h2>Operational Updates</h2>
            <p class="panel__lede">Realtime visitor alerts, incident updates, and approval events stay visible without crowding the dashboard.</p>
          </div>
        </div>
        <div class="work-list" id="operational-feed-list"></div>
      </article>
    </section>
  `;
}
