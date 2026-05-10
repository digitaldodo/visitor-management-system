import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, workCard } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["queue", "check-in", "photo", "qr", "badges"];

document.addEventListener("DOMContentLoaded", async () => {
  const session = requireRole("SECURITY_GUARD");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  initVisitorModule("[data-security-visitors]", {
    basePath: "/security",
    title: "Visitor Check-in and Records",
    eyebrow: "Front Desk Registration",
    canDelete: false,
  });
  await loadSecurityPortal();
});

async function loadSecurityPortal() {
  try {
    const [overview, queue, checkins, photo, qr, badges] = await Promise.all([
      request("/security/overview"),
      request("/security/queue"),
      request("/security/checkins"),
      request("/security/photo-capture"),
      request("/security/qr-verification"),
      request("/security/badges"),
    ]);

    renderMetrics(overview.data.metrics);
    renderWorkList("#queue-list", queue.data.items || [], (visitor) => workCard(visitor.fullName, visitor.purposeOfVisit, visitor.status));
    renderWorkList("#checkins-list", checkins.data.items || [], (checkin) => workCard(checkin.fullName, checkin.hostEmployee, checkin.status));
    renderWorkList("#qr-list", qr.data, (scan) => workCard(scan.code, scan.status));
    renderWorkList("#badge-list", Object.entries(badges.data), ([label, value]) => workCard(label, value));
    renderWorkList("#photo-list", Object.entries(photo.data), ([label, value]) => workCard(label, value));
  } catch (error) {
    showToast("Security access blocked", error.message);
  }
}
