import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { formatDate, formatDurationMinutes, formatStatus, minutesBetween } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, escapeHtml } from "../shared/portalShell.js";
import { listOrganizations } from "../shared/organizationApi.js";
import { getVisitorPass, getVisitorHistory, uploadVisitPhoto } from "../shared/visitorApi.js";
import { initHostPicker } from "../shared/hostPicker.js";
import { badgeDialogMarkup, downloadBadge, printBadge } from "../shared/badgeStudio.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["visits", "history", "request"];
let activeBadge = null;

document.addEventListener("DOMContentLoaded", async () => {
  initAppErrorBoundary();

  const session = requireRole("VISITOR");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  await initOrganizations(session);
  initHostPicker(document.querySelector("#visitor-request-form"), { basePath: "/visitor" });
  initRequestForm();
  initVisitActions();
  initBadgeActions();
  await loadVisitorPortal();
});

async function loadVisitorPortal() {
  try {
    const [overview, visits, history] = await Promise.all([
      request("/visitor/overview"),
      request("/visitor/visits"),
      getVisitorHistory("/visitor"),
    ]);
    renderMetrics([
      { label: "Pending", value: overview.data.pending, note: "Awaiting host approval" },
      { label: "Active passes", value: overview.data.activePasses, note: "Approved or checked in" },
      { label: "Total requests", value: overview.data.totalRequests, note: "Saved in your access history" },
    ]);
    setOrganizationContext(overview.data);
    renderVisits(visits.data || []);
    renderHistory(history.data);
  } catch (error) {
    renderMetrics([]);
    renderVisits([]);
    renderHistory(null);
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
    const photoFile = form.querySelector("[name='photoFile']")?.files?.[0] || null;
    const payload = {
      phone: trim(data.phone),
      companyCode: trim(data.companyCode),
      hostEmployee: trim(data.hostEmployee),
      hostEmployeeId: trim(data.hostEmployeeId),
      purposeOfVisit: trim(data.purposeOfVisit),
    };
    const error = validateVisitRequest(payload, photoFile);
    if (error) {
      showToast("Check request", error);
      return;
    }

    setFormLoading(form, true);
    try {
      const upload = await uploadVisitPhoto(photoFile);
      payload.photoUrl = upload.data.url;
      payload.photoPublicId = upload.data.publicId;
      await request("/visitor/visits", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      resetHostPicker(form);
      showToast("Request submitted", "Your host will review the visit request.");
      await loadVisitorPortal();
    } catch (error) {
      showToast("Request failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitActions() {
  document.querySelector("#visitor-visits-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-visit-action]");
    if (!button) {
      return;
    }
    const visitorId = button.dataset.visitorId;
    if (button.dataset.visitAction !== "badge") {
      return;
    }
    try {
      const response = await getVisitorPass("/visitor", visitorId);
      activeBadge = response.data;
      openBadgeModal(activeBadge);
    } catch (error) {
      showToast("Badge unavailable", error.message);
    }
  });
}

function initBadgeActions() {
  const modal = document.querySelector("#visitor-badge-modal");
  modal?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-action]");
    if (!button || !activeBadge) {
      if (event.target === modal) {
        closeBadgeModal();
      }
      return;
    }

    const badgeCard = modal.querySelector("[data-badge-card]");
    const action = button.dataset.badgeAction;
    try {
      if (action === "close") {
        closeBadgeModal();
      }
      if (action === "print") {
        printBadge(badgeCard);
      }
      if (action === "png" || action === "pdf") {
        await downloadBadge(activeBadge, action);
        showToast("Badge downloaded", `Saved ${action.toUpperCase()} badge export.`);
      }
    } catch (error) {
      showToast("Badge action failed", error.message);
    }
  });
}

function openBadgeModal(pass) {
  const modal = document.querySelector("#visitor-badge-modal");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-hidden");
  modal.innerHTML = badgeDialogMarkup(pass);
}

function closeBadgeModal() {
  const modal = document.querySelector("#visitor-badge-modal");
  modal?.classList.add("is-hidden");
  if (modal) {
    modal.innerHTML = "";
  }
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
  const duration = visit.checkInTime ? formatDurationMinutes(minutesBetween(visit.checkInTime, visit.checkOutTime || new Date())) : "Pending";
  return `
    <article class="visitor-visit-card">
      <div class="visitor-visit-card__header">
        <div>
          <h3>${escapeHtml(visit.hostEmployee || "Host pending")}</h3>
          <p>${escapeHtml(visit.hostEmployeeDepartment || "Department pending")} · ${escapeHtml(visit.purposeOfVisit || "Visit request")}</p>
        </div>
        <span class="status-badge status-badge--${String(visit.status).toLowerCase().replaceAll("_", "-")}">${escapeHtml(status)}</span>
      </div>
      <dl>
        <div><dt>Requested</dt><dd>${escapeHtml(formatDate(visit.createdAt))}</dd></div>
        <div><dt>Organization</dt><dd>${escapeHtml(visit.organizationName || visit.organizationCode || "Not provided")}</dd></div>
        <div><dt>Visitor company</dt><dd>${escapeHtml(visit.companyName || "Not provided")}</dd></div>
        <div><dt>Badge ID</dt><dd>${escapeHtml(visit.badgeId || "Issued after approval")}</dd></div>
        <div><dt>Pass code</dt><dd>${escapeHtml(visit.qrCode || "Available after approval")}</dd></div>
        <div><dt>Visit duration</dt><dd>${escapeHtml(duration)}</dd></div>
      </dl>
      <div class="visitor-visit-card__footer">
        <span>${escapeHtml(visit.rejectionReason || (passReady ? "Badge ready. Present it at the security checkpoint." : "We will update this status after review."))}</span>
        ${passReady ? `<button class="button button--primary" type="button" data-visit-action="badge" data-visitor-id="${escapeHtml(visit.id)}">Open badge</button>` : ""}
      </div>
    </article>
  `;
}

function renderHistory(history) {
  const summary = document.querySelector("#visitor-history-summary");
  const timeline = document.querySelector("#visitor-history-timeline");
  if (!summary || !timeline || !history) {
    if (summary) {
      summary.innerHTML = "";
    }
    if (timeline) {
      timeline.innerHTML = `
        <article class="empty-state empty-state--inline">
          <h3>No visitor history yet</h3>
          <p>Your visit record will start building after your first request.</p>
        </article>
      `;
    }
    return;
  }

  summary.innerHTML = `
    <article class="visitor-history-stat">
      <span>Total visits</span>
      <strong>${escapeHtml(history.totalVisits)}</strong>
      <small>${escapeHtml(history.repeatVisits)} repeat visit${history.repeatVisits === 1 ? "" : "s"}</small>
    </article>
    <article class="visitor-history-stat">
      <span>Approved</span>
      <strong>${escapeHtml(history.approvedVisits)}</strong>
      <small>Includes current active passes</small>
    </article>
    <article class="visitor-history-stat">
      <span>Checked out</span>
      <strong>${escapeHtml(history.checkedOutVisits)}</strong>
      <small>Completed visits</small>
    </article>
    <article class="visitor-history-stat">
      <span>Previous hosts</span>
      <strong>${escapeHtml(history.previousHosts.length)}</strong>
      <small>${escapeHtml((history.previousHosts || []).slice(0, 2).join(", ") || "None yet")}</small>
    </article>
  `;

  const records = history.records || [];
  timeline.innerHTML = records.length ? records.map(historyCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No visitor history yet</h3>
      <p>Your visit record will start building after your first request.</p>
    </article>
  `;
}

function historyCard(record) {
  return `
    <article class="visitor-history-card">
      <div class="visitor-history-card__header">
        <div>
          <h3>${escapeHtml(record.hostEmployee || "Host pending")}</h3>
          <p>${escapeHtml(record.purposeOfVisit || "Visit")} · ${escapeHtml(record.organizationName || record.organizationCode || "Organization pending")}</p>
        </div>
        <span class="status-badge status-badge--${String(record.status).toLowerCase().replaceAll("_", "-")}">${escapeHtml(formatStatus(record.status))}</span>
      </div>
      <ol class="visitor-history-card__timeline">
        ${(record.statusHistory || []).map((entry) => `
          <li>
            <strong>${escapeHtml(formatStatus(entry.status))}</strong>
            <span>${escapeHtml(formatDate(entry.timestamp))}</span>
            ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
          </li>
        `).join("")}
      </ol>
    </article>
  `;
}

function validateVisitRequest(payload, photoFile) {
  if (!payload.phone || payload.phone.length < 7) {
    return "Enter a reachable phone number.";
  }
  if (!payload.companyCode) {
    return "Choose the organization you are visiting.";
  }
  if (!payload.hostEmployeeId) {
    return "Select your host from the employee directory.";
  }
  if (!payload.purposeOfVisit || payload.purposeOfVisit.length < 2) {
    return "Enter the purpose of your visit.";
  }
  if (!photoFile) {
    return "Attach a visitor photo for badge generation.";
  }
  return "";
}

async function initOrganizations(session) {
  const select = document.querySelector("[data-organization-select]");
  if (!select) {
    return;
  }

  try {
    const response = await listOrganizations();
    const organizations = response.data || [];
    select.innerHTML = `<option value="">Select organization</option>${organizations.map((organization) => `
      <option value="${escapeHtml(organization.companyCode)}">${escapeHtml(organization.companyName)} (${escapeHtml(organization.companyCode)})</option>
    `).join("")}`;
    if (session.organizationCode) {
      select.value = session.organizationCode;
    }
  } catch (error) {
    select.innerHTML = `<option value="">Organizations unavailable</option>`;
    showToast("Organizations unavailable", error.message);
  }
}

function setOrganizationContext(data = {}) {
  const element = document.querySelector("#organization-context");
  if (!element) {
    return;
  }
  const organization = data.organizationName || data.organizationCode;
  element.textContent = organization
    ? `Request access, open your badge, and track history for ${organization}.`
    : "Track approvals, badge access, and visitor history.";
}

function setFormLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button?.toggleAttribute("disabled", loading);
  button?.classList.toggle("is-loading", loading);
  button?.toggleAttribute("aria-busy", loading);
}

function resetHostPicker(form) {
  form.querySelector("[data-host-search-input]")?.setAttribute("value", "");
  const input = form.querySelector("[data-host-search-input]");
  if (input) {
    input.value = "";
  }
  form.querySelector("[data-host-id]")?.setAttribute("value", "");
  form.querySelector("[data-host-name]")?.setAttribute("value", "");
  const hostId = form.querySelector("[data-host-id]");
  const hostName = form.querySelector("[data-host-name]");
  if (hostId) {
    hostId.value = "";
  }
  if (hostName) {
    hostName.value = "";
  }
  form.querySelector("[data-host-meta]")?.replaceChildren(document.createTextNode("Search by employee name, email, or username."));
  form.querySelector("[data-host-results]")?.classList.add("is-hidden");
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}
