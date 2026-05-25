export function render(context = {}) {
  const user = context.session?.user || {};
  const organization = context.session?.organizationName || user.organizationName || "Organization";
  const name = user.fullName || user.name || user.username || "Security guard";
  const email = user.email || "Email not recorded";
  const role = Array.isArray(user.roles) ? user.roles.join(", ") : user.role || "SECURITY_GUARD";

  return `
    <section class="security-route profile-page" data-page-route="profile">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Profile</p>
            <h2>Guard Account</h2>
            <p class="panel__lede">Identity is loaded from the active protected session.</p>
          </div>
        </div>
        <dl class="employee-summary-list security-profile-list">
          <div class="employee-summary-tile"><span>Name</span><strong>${escapeHtml(name)}</strong></div>
          <div class="employee-summary-tile"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
          <div class="employee-summary-tile"><span>Role</span><strong>${escapeHtml(role)}</strong></div>
          <div class="employee-summary-tile"><span>Organization</span><strong>${escapeHtml(organization)}</strong></div>
        </dl>
      </article>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
