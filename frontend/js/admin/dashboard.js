import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, workCard } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["analytics", "users", "reports", "monitoring", "visitors"];

document.addEventListener("DOMContentLoaded", async () => {
  const session = requireRole("ADMIN");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  initVisitorModule("[data-admin-visitors]", {
    basePath: "/admin",
    title: "Full Visitor Access",
    eyebrow: "Visitor Records",
    canDelete: true,
  });
  await loadAdminPortal();
});

async function loadAdminPortal() {
  try {
    const [overview, users, reports, monitoring] = await Promise.all([
      request("/admin/overview"),
      request("/admin/users"),
      request("/admin/reports"),
      request("/admin/monitoring"),
    ]);

    renderMetrics(overview.data.metrics);
    renderWorkList("#user-management-list", users.data, (user) => workCard(user.name, user.role, user.status));
    renderWorkList("#reports-list", reports.data, (report) => workCard(report.title, report.status));
    renderMonitoring(monitoring.data);
  } catch (error) {
    showToast("Admin access blocked", error.message);
  }
}

function renderMonitoring(data) {
  renderWorkList("#monitoring-list", Object.entries(data), ([name, status]) => {
    const value = typeof status === "object" ? Object.entries(status).map(([key, count]) => `${key}: ${count}`).join(", ") : status;
    return workCard(name, value);
  });
}
