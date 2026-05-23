export function render() {
  return `
    <section class="visitor-route visitor-history-page" data-page-route="history">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Visit History</p>
            <h2>Visitor Timeline</h2>
            <p class="panel__lede">Past visits, approval decisions, check-in and check-out history, denied requests, and expired passes.</p>
          </div>
        </div>
        <form class="visitor-history-filters" id="visitor-history-filters">
          <label class="form-field">
            <span>Date</span>
            <input name="date" type="date" />
          </label>
          <label class="form-field">
            <span>Organization</span>
            <input name="organization" type="search" placeholder="Filter by organization" />
          </label>
          <label class="form-field">
            <span>Status</span>
            <select name="status">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Denied</option>
              <option value="CHECKED_IN">Checked in</option>
              <option value="CHECKED_OUT">Checked out</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
          <button class="button button--ghost" type="reset">Clear</button>
        </form>
        <div class="visitor-history-summary" id="visitor-history-summary"></div>
        <div class="visitor-history-timeline" id="visitor-history-timeline"></div>
      </article>
    </section>
  `;
}
