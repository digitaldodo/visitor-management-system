export function render() {
  return `
    <section class="visitor-route visitor-notifications-page" data-page-route="notifications">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Notifications</p>
            <h2>Visitor Inbox</h2>
          </div>
          <button class="button button--ghost" type="button" data-visitor-notifications-read-all>Mark all read</button>
        </div>
        <div class="notification-list visitor-notification-list" id="visitor-notifications-list"></div>
      </article>
    </section>
  `;
}
