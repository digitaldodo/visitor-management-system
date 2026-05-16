import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatDurationMinutes, formatStatus, getDefaultTimezone, minutesBetween, timezoneLabel, toIsoInstant } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, escapeHtml } from "../shared/portalShell.js";
import { initOrganizationSelectors } from "../shared/organizationSelector.js";
import { getVisitorPass, getVisitorHistory, requestVisitReschedule, uploadVisitPhoto } from "../shared/accessService.js";
import { initHostPicker } from "../shared/hostPicker.js";
import { badgeDialogMarkup, downloadBadge, hydrateBadgePreview, printBadge } from "../shared/badgeStudio.js";
import { showToast } from "../shared/toast.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "../shared/phoneInput.js";

const ROUTES = ["visits", "history", "request"];
let activeBadge = null;

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("visitor-portal", () => bootVisitorPortal(), {
    redirectToLogin: true,
    failureMessage: "AccessFlow had trouble restoring the visitor portal. Refreshing workspace...",
  });
});

async function bootVisitorPortal() {
  initAppErrorBoundary();

  const session = requireRole("VISITOR");
  if (!session) {
    return;
  }

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    onRefresh: () => loadVisitorPortal(),
  });
  await runSafely("visitor organizations", () => initOrganizations(session), {
    toastTitle: "Organizations unavailable",
  });
  await runSafely("visitor host picker", () => initHostPicker(document.querySelector("#visitor-request-form"), { basePath: "/visitor" }), {
    toastTitle: "Host search unavailable",
  });
  initRequestForm();
  initScheduleHints();
  initVisitActions();
  initBadgeActions();
  await loadVisitorPortal();
}

async function loadVisitorPortal() {
  const [overview, visits, history] = await Promise.allSettled([
    request("/visitor/overview"),
    request("/visitor/visits"),
    getVisitorHistory("/visitor"),
  ]);

  if (overview.status === "fulfilled") {
    const overviewData = overview.value?.data || {};
    renderMetrics([
      { label: "Pending", value: overviewData.pending || 0, note: "Awaiting host approval" },
      { label: "Active passes", value: overviewData.activePasses || 0, note: "Approved or checked in" },
      { label: "Total requests", value: overviewData.totalRequests || 0, note: "Saved in your access history" },
    ]);
    setOrganizationContext(overviewData);
  } else {
    renderMetrics([]);
  }

  if (visits.status === "fulfilled") {
    renderVisits(visits.value?.data || []);
  } else {
    renderVisits([]);
    showToast("Visits unavailable", visits.reason?.message || "Visit requests could not be loaded.");
  }

  if (history.status === "fulfilled") {
    renderHistory(history.value?.data || null);
  } else {
    renderHistory(null);
  }
}

function initRequestForm() {
  const form = document.querySelector("#visitor-request-form");
  if (!form) {
    return;
  }
  initPhoneInput(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const phone = phonePayload(data);
    const photoFile = form.querySelector("[name='photoFile']")?.files?.[0] || null;
    const payload = {
      phoneCountryCode: phone.phoneCountryCode,
      phone: phone.phone,
      companyCode: trim(data.companyCode),
      hostEmployee: trim(data.hostEmployee),
      hostEmployeeId: trim(data.hostEmployeeId),
      purposeOfVisit: trim(data.purposeOfVisit),
      scheduledStartTime: toIsoInstant(data.scheduledStartTime, getDefaultTimezone()),
      expectedDurationMinutes: Number(data.expectedDurationMinutes || 60),
      timezone: getDefaultTimezone(),
    };
    const error = validateVisitRequest(payload, photoFile);
    if (error) {
      showToast("Check request", error);
      return;
    }

    setFormLoading(form, true);
    try {
      const upload = await uploadVisitPhoto(photoFile);
      const uploadData = upload?.data || {};
      if (!uploadData.url) {
        throw new Error("Photo upload response was empty.");
      }
      payload.photoUrl = uploadData.url;
      payload.photoPublicId = uploadData.publicId;
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
    if (button.dataset.visitAction === "reschedule") {
      await handleRescheduleRequest(visitorId);
      return;
    }
    if (button.dataset.visitAction !== "badge") {
      return;
    }
    try {
      const response = await getVisitorPass("/visitor", visitorId);
      activeBadge = response?.data || null;
      if (!activeBadge) {
        throw new Error("Badge response was empty.");
      }
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

    const action = button.dataset.badgeAction;
    try {
      if (action === "close") {
        closeBadgeModal();
      }
      if (action === "print") {
        await printBadge(activeBadge);
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
  void hydrateBadgePreview(modal, pass);
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

function initScheduleHints() {
  const hint = document.querySelector("#visitor-schedule-hint");
  if (hint) {
    hint.textContent = `Access opens 1 hour before arrival and closes 1 hour after expected end in ${timezoneLabel(getDefaultTimezone())}.`;
  }
}

async function handleRescheduleRequest(visitorId) {
  const dateTime = window.prompt("Suggest a new visit date and arrival time as YYYY-MM-DD HH:mm.");
  if (!dateTime) {
    return;
  }
  const scheduledStartTime = toIsoInstant(dateTime.trim().replace(" ", "T"), getDefaultTimezone());
  if (!scheduledStartTime || new Date(scheduledStartTime) <= new Date()) {
    showToast("Invalid timing", "Enter a future date and time.");
    return;
  }
  const note = window.prompt("Optional note for your host.") || "";
  try {
    await requestVisitReschedule(visitorId, {
      scheduledStartTime,
      expectedDurationMinutes: 60,
      timezone: getDefaultTimezone(),
      note: note.trim(),
    });
    showToast("Reschedule requested", "Your host will approve or reject the new timing.");
    await loadVisitorPortal();
  } catch (error) {
    showToast("Reschedule failed", error.message);
  }
}

function visitCard(visit) {
  const status = formatStatus(visit.status);
  const passReady = ["APPROVED", "CHECKED_IN"].includes(visit.status) && visit.qrCode;
  const duration = visit.checkInTime ? formatDurationMinutes(minutesBetween(visit.checkInTime, visit.checkOutTime || new Date())) : "Pending";
  const passMessage = visit.rejectionReason
    || (visit.status === "CHECKED_IN"
      ? "Security has checked you in. Keep this badge available until departure."
      : passReady
        ? "Badge ready. Present it at the security checkpoint."
        : "We will update this status after review.");
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
        <div><dt>Arrival</dt><dd>${escapeHtml(formatDate(visit.scheduledStartTime))}</dd></div>
        <div><dt>Access window</dt><dd>${escapeHtml(formatWindow(visit.accessWindowStartTime, visit.accessWindowEndTime, visit.organizationTimezone))}</dd></div>
        <div><dt>Badge ID</dt><dd>${escapeHtml(visit.badgeId || "Issued after approval")}</dd></div>
        <div><dt>Pass code</dt><dd>${escapeHtml(visit.qrCode || "Available after approval")}</dd></div>
        <div><dt>Visit duration</dt><dd>${escapeHtml(duration)}</dd></div>
        <div><dt>Reschedule</dt><dd>${escapeHtml(visit.rescheduleStatus || "None")}</dd></div>
      </dl>
      <div class="visitor-visit-card__footer">
        <span>${escapeHtml(passMessage)}</span>
        ${["PENDING", "APPROVED"].includes(visit.status) ? `<button class="button button--ghost" type="button" data-visit-action="reschedule" data-visitor-id="${escapeHtml(visit.id)}">Request reschedule</button>` : ""}
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
  const phoneError = validatePhonePayload(payload);
  if (phoneError) {
    return phoneError;
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
  if (!payload.scheduledStartTime || new Date(payload.scheduledStartTime) <= new Date()) {
    return "Choose a future visit date and arrival time.";
  }
  if (!payload.expectedDurationMinutes || payload.expectedDurationMinutes < 15 || payload.expectedDurationMinutes > 1440) {
    return "Choose a valid expected duration.";
  }
  if (!photoFile) {
    return "Attach a visitor photo for badge generation.";
  }
  return "";
}

async function initOrganizations(session) {
  const control = document.querySelector("[data-organization-selector], [data-organization-select]");
  if (!control) {
    return;
  }

  if (session.organizationCode) {
    control.value = session.organizationCode;
  }
  initOrganizationSelectors(document, { prefetch: true });
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

function formatWindow(start, end, timezone) {
  if (!start || !end) {
    return "Pending schedule";
  }
  const zone = timezone || getDefaultTimezone();
  return `${formatDate(start, { dateStyle: "medium", timeStyle: "short", timeZone: zone })} - ${formatDate(end, { timeStyle: "short", timeZone: zone })} ${timezoneLabel(zone)}`;
}
