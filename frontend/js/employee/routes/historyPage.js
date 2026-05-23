export function render() {
  return `
    <section class="employee-route history-page" data-page-route="history">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Visitor History</p>
            <h2>Hosted Visitor Timeline</h2>
            <p class="panel__lede">All visitors you hosted, with approval, completion, denial, and status timeline context.</p>
          </div>
        </div>
        <form class="history-filter-bar" id="visitor-history-filter" novalidate>
          <label class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 18.6-4.2-4.2a7 7 0 1 0-1.4 1.4l4.2 4.2ZM5 10a5 5 0 1 1 5 5 5 5 0 0 1-5-5Z"/></svg>
            <input name="query" type="search" placeholder="Search visitor, company, badge, purpose" />
          </label>
          <label class="form-field">
            <span>Status</span>
            <select name="status">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Denied</option>
              <option value="CHECKED_IN">Checked in</option>
              <option value="CHECKED_OUT">Completed</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
          <label class="form-field">
            <span>Department</span>
            <input name="department" type="text" placeholder="Department" />
          </label>
          <label class="form-field">
            <span>Visitor type</span>
            <select name="visitorType">
              <option value="">All types</option>
              <option value="ONE_TIME">One-time</option>
              <option value="WALK_IN">Walk-in</option>
              <option value="EMERGENCY">Emergency</option>
              <option value="RECURRING">Recurring</option>
              <option value="CONTRACTOR_VENDOR">Contractor / vendor</option>
            </select>
          </label>
          <label class="form-field">
            <span>From</span>
            <input name="from" type="date" />
          </label>
          <label class="form-field">
            <span>To</span>
            <input name="to" type="date" />
          </label>
          <div class="form-actions">
            <button class="button button--primary" type="submit">Apply filters</button>
            <button class="button button--ghost" type="button" data-history-clear>Reset</button>
          </div>
        </form>
      </article>
      <article class="panel">
        <div class="work-list history-list" id="visitor-history-list"></div>
        <div class="history-pagination" id="visitor-history-pagination"></div>
      </article>
    </section>
  `;
}
