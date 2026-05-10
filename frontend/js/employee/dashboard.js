import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, workCard } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["approvals", "pre-approvals", "notifications", "scheduled", "history"];

document.addEventListener("DOMContentLoaded", async () => {
  const session = requireRole("EMPLOYEE");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  initVisitorModule("[data-employee-visitors]", {
    basePath: "/employee",
    title: "Visitor Registration and History",
    eyebrow: "Personal Records",
    showHostFields: false,
    canDelete: false,
  });
  await loadEmployeePortal();
});

async function loadEmployeePortal() {
  try {
    const [overview, approvals, preApprovals, notifications, scheduled] = await Promise.all([
      request("/employee/overview"),
      request("/employee/approvals"),
      request("/employee/pre-approvals"),
      request("/employee/notifications"),
      request("/employee/scheduled-visitors"),
    ]);

    renderMetrics(overview.data.metrics);
    renderWorkList("#approvals-list", approvals.data, (approval) => workCard(approval.visitor, approval.purpose, approval.status));
    renderWorkList("#pre-approvals-list", preApprovals.data, (approval) => workCard(approval.visitor, approval.date, approval.status));
    renderWorkList("#notifications-list", notifications.data, (notification) => workCard(notification.title, notification.message));
    renderWorkList("#scheduled-list", scheduled.data, (visitor) => workCard(visitor.visitor, visitor.time, visitor.status));
  } catch (error) {
    showToast("Employee access blocked", error.message);
  }
}
