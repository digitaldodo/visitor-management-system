import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { formatDate, formatStatus } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, escapeHtml } from "../shared/portalShell.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["visits", "request"];

document.addEventListener("DOMContentLoaded", async () => {
  initAppErrorBoundary();

  const session = requireRole("VISITOR");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  initRequestForm();
  await loadVisitorPortal();
});

async function loadVisitorPortal() {
  try {
    const [overview, visits] = await Promise.all([
      request("/visitor/overview"),
      request("/visitor/visits"),
    ]);
    renderMetrics([
      { label: "Pending", value: overview.data.pending, note: "Awaiting host approval" },
      { label: "Active passes", value: overview.data.activePasses, note: "Approved or checked in" },
    ]);
    renderVisits(visits.data || []);
  } catch (error) {
    renderMetrics([]);
    renderVisits([]);
    showToast("Visitor access unavailable", error.message);
  }
}

function initRequestForm() {
  const form = document.querySelector("#visitor-request-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      phone: trim(data.phone),
      companyName: trim(data.companyName),
      hostEmployee: trim(data.hostEmployee),
      purposeOfVisit: trim(data.purposeOfVisit),
    };
    const error = validateVisitRequest(payload);
    if (error) {
      showToast("Check request", error);
      return;
    }

    setFormLoading(form, true);
    try {
      await request("/visitor/visits", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      showToast("Request submitted", "Your host will review the visit request.");
      await loadVisitorPortal();
    } catch (error) {
      showToast("Request failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function renderVisits(items) {
  const list = document.querySelector("#visitor-visits-list");
  if (!list) {
    return;
  }

  list.innerHTML = items.length ? items.map(visitCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No visit requests</h3>
      <p>Submit a request when you plan to visit an AccessFlow-managed location.</p>
    </article>
  `;
}

function visitCard(visit) {
  const status = formatStatus(visit.status);
  const passReady = ["APPROVED", "CHECKED_IN"].includes(visit.status) && visit.qrCode;
  return `
    <article class="visitor-visit-card">
      <div class="visitor-visit-card__header">
        <div>
          <h3>${escapeHtml(visit.hostEmployee || "Host pending")}</h3>
          <p>${escapeHtml(visit.purposeOfVisit || "Visit request")}</p>
        </div>
        <span class="status-badge status-badge--${String(visit.status).toLowerCase().replaceAll("_", "-")}">${escapeHtml(status)}</span>
      </div>
      <dl>
        <div><dt>Requested</dt><dd>${escapeHtml(formatDate(visit.createdAt))}</dd></div>
        <div><dt>Company</dt><dd>${escapeHtml(visit.companyName || "Not provided")}</dd></div>
        <div><dt>Pass code</dt><dd>${escapeHtml(visit.qrCode || "Available after approval")}</dd></div>
        <div><dt>Expires</dt><dd>${escapeHtml(visit.qrExpiresAt ? formatDate(visit.qrExpiresAt) : "Not issued")}</dd></div>
      </dl>
      <div class="visitor-visit-card__footer">
        <span>${escapeHtml(visit.rejectionReason || (passReady ? "Approved pass is ready for reception." : "We will update this status after review."))}</span>
      </div>
    </article>
  `;
}

function validateVisitRequest(payload) {
  if (!payload.phone || payload.phone.length < 7) {
    return "Enter a reachable phone number.";
  }
  if (!payload.hostEmployee || payload.hostEmployee.length < 2) {
    return "Enter the host you are visiting.";
  }
  if (!payload.purposeOfVisit || payload.purposeOfVisit.length < 2) {
    return "Enter the purpose of your visit.";
  }
  return "";
}

function setFormLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button?.toggleAttribute("disabled", loading);
  button?.classList.toggle("is-loading", loading);
  button?.toggleAttribute("aria-busy", loading);
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}
