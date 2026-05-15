import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { formatDate, formatStatus, formatTime, getDefaultTimezone, timezoneLabel, toDatetimeLocal, toIsoInstant } from "../shared/formatters.js?v=20260515-scheduling";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js?v=20260515-scheduling";
import { approveRescheduleRequest, approveVisitor, hostRescheduleVisitor, preApproveVisitor, rejectRescheduleRequest, rejectVisitor } from "../shared/accessService.js?v=20260515-scheduling";
import { showToast } from "../shared/toast.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "../shared/phoneInput.js";

const ROUTES = ["approvals", "pre-approvals", "notifications", "scheduled", "history"];
let approvalPollTimer;

document.addEventListener("DOMContentLoaded", () => {
  void bootEmployeePortal();
});

async function bootEmployeePortal() {
  initAppErrorBoundary();

  const session = requireRole("EMPLOYEE");
  if (!session) {
    return;
  }

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    onRefresh: () => loadEmployeePortal(),
  });
  await runSafely("employee visitor module", () => initVisitorModule("[data-employee-visitors]", {
    basePath: "/employee",
    title: "Visitor Registration and History",
    eyebrow: "Personal Records",
    showHostFields: false,
    canDelete: false,
  }), { toastTitle: "Visitor history unavailable" });
  initApprovalActions();
  initScheduledActions();
  initPreApprovalForm();
  await loadEmployeePortal();
  approvalPollTimer = window.setInterval(() => loadApprovals(false), 15000);
  window.addEventListener("beforeunload", () => window.clearInterval(approvalPollTimer));
}

async function loadEmployeePortal() {
  renderMetrics([]);
  renderLoadingList("#approvals-list");
  renderLoadingList("#notifications-list");
  renderLoadingList("#scheduled-list");

  const [overview, notifications, scheduled] = await Promise.allSettled([
    request("/employee/overview"),
    request("/employee/notifications"),
    request("/employee/scheduled-visitors"),
  ]);

  if (overview.status === "fulfilled") {
    renderMetrics(overview.value?.data?.metrics || []);
  } else {
    renderMetrics([]);
  }

  await loadApprovals(false);

  if (notifications.status === "fulfilled") {
    renderWorkList("#notifications-list", notifications.value?.data || [], (notification) => workCard(notification.title, notification.message), "No employee notices", "Visitor updates and reminders will appear here.");
  } else {
    renderWorkList("#notifications-list", [], (item) => item, "Notifications unavailable", notifications.reason?.message || "Notifications could not be loaded.");
  }

  if (scheduled.status === "fulfilled") {
    renderScheduledVisitors(scheduled.value?.data || []);
  } else {
    renderWorkList("#scheduled-list", [], (item) => item, "Schedule unavailable", scheduled.reason?.message || "Schedule could not be loaded.");
  }
}

function initPreApprovalForm() {
  const form = document.querySelector("#preapproval-form");
  if (!form) {
    return;
  }

  initPhoneInput(form);
  const timezone = getDefaultTimezone();
  const timezoneLabel = document.querySelector("#preapproval-timezone");
  if (timezoneLabel) {
    timezoneLabel.textContent = `Times use ${timezoneLabelText(timezone)}`;
  }
  setScheduleMinimums(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = preApprovalPayload(form, timezone);
    const error = validatePreApproval(payload);
    if (error) {
      showToast("Check schedule", error);
      return;
    }

    setFormLoading(form, true);
    try {
      await preApproveVisitor(payload);
      form.reset();
      setScheduleMinimums(form);
      showToast("Visitor pre-approved", "Security can verify the visitor during the scheduled window.");
      await loadEmployeePortal();
    } catch (error) {
      showToast("Pre-approval failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

async function loadApprovals(showToastOnSuccess) {
  const list = document.querySelector("#approvals-list");
  if (!list) {
    return;
  }

  try {
    const approvals = await request("/employee/approvals");
    const items = approvals?.data?.items || [];
    list.innerHTML = items.length ? items.map(approvalCard).join("") : `
      <article class="approval-empty">
        <h3>No pending approvals</h3>
        <p>New visitor requests will appear here automatically.</p>
      </article>
    `;
    if (showToastOnSuccess) {
      showToast("Approvals refreshed", `${items.length} pending request${items.length === 1 ? "" : "s"}.`);
    }
  } catch (error) {
    showToast("Approvals unavailable", error.message);
  }
}

function initApprovalActions() {
  document.querySelector("#approvals-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-approval-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.approvalAction;
    const id = button.dataset.visitorId;
    const card = button.closest(".approval-card");
    const note = card?.querySelector("[data-approval-note]")?.value?.trim() || "";

    setApprovalLoading(card, true);
    try {
      if (action === "approve") {
        await approveVisitor("/employee", id, note);
        showToast("Visitor approved", "Security can now check in this visitor.");
      }
      if (action === "reject") {
        await rejectVisitor("/employee", id, note || "Rejected by host employee.");
        showToast("Visitor rejected", "Security will see the updated status.");
      }
      if (action === "approve-reschedule") {
        await approveRescheduleRequest("/employee", id, note);
        showToast("Reschedule approved", "The previous QR was invalidated and a new pass window is active.");
      }
      if (action === "reject-reschedule") {
        await rejectRescheduleRequest("/employee", id, note || "Timing change declined by host employee.");
        showToast("Reschedule rejected", "The original approved timing remains active.");
      }
      await loadApprovals(false);
      await loadEmployeePortal();
    } catch (error) {
      showToast("Approval failed", error.message);
    } finally {
      setApprovalLoading(card, false);
    }
  });
}

function renderScheduledVisitors(items) {
  const list = document.querySelector("#scheduled-list");
  if (!list) {
    return;
  }

  list.innerHTML = items.length ? items.map(scheduledCard).join("") : `
    <article class="approval-empty">
      <h3>No upcoming visitors</h3>
      <p>Pre-approved visitors will appear here after scheduling.</p>
    </article>
  `;
}

function scheduledCard(visitor) {
  const windowText = `${formatDate(visitor.accessWindowStartTime || visitor.scheduledStartTime)} - ${formatTime(visitor.accessWindowEndTime || visitor.scheduledEndTime)}`;
  const company = visitor.companyName || "Unlisted company";
  const status = formatStatus(visitor.status);
  const pending = visitor.rescheduleStatus === "PENDING" && visitor.pendingScheduledStartTime;
  return `
    <article class="scheduled-card">
      <div>
        <h3>${escapeHtml(visitor.fullName)}</h3>
        <p>${escapeHtml(company)} · ${escapeHtml(visitor.purposeOfVisit)}</p>
      </div>
      <dl>
        <div><dt>Window</dt><dd>${escapeHtml(windowText)}</dd></div>
        <div><dt>Meeting</dt><dd>${escapeHtml(formatDate(visitor.scheduledStartTime))}</dd></div>
        <div><dt>Reschedule</dt><dd>${escapeHtml(pending ? formatDate(visitor.pendingScheduledStartTime) : visitor.rescheduleStatus || "None")}</dd></div>
        <div><dt>Pass</dt><dd>${escapeHtml(visitor.qrCode || "Pending")}</dd></div>
      </dl>
      <div class="scheduled-card__footer">
        <span>${escapeHtml(visitor.scheduledTimezone || "UTC")}</span>
        <span class="status-badge status-badge--${String(visitor.status).toLowerCase().replaceAll("_", "-")}">${escapeHtml(status)}</span>
      </div>
      <div class="scheduled-card__actions">
        ${pending ? `<button class="button button--primary" type="button" data-approval-action="approve-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Approve timing</button><button class="button button--ghost" type="button" data-approval-action="reject-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Reject timing</button>` : ""}
        <button class="button button--ghost" type="button" data-direct-reschedule="${escapeHtml(visitor.id)}">Modify timing</button>
      </div>
    </article>
  `;
}

function initScheduledActions() {
  document.querySelector("#scheduled-list")?.addEventListener("click", async (event) => {
    const decisionButton = event.target.closest("[data-approval-action]");
    if (decisionButton) {
      try {
        if (decisionButton.dataset.approvalAction === "approve-reschedule") {
          await approveRescheduleRequest("/employee", decisionButton.dataset.visitorId, "");
          showToast("Reschedule approved", "The badge was regenerated for the new timing.");
        }
        if (decisionButton.dataset.approvalAction === "reject-reschedule") {
          const note = window.prompt("Reason for rejecting this timing change.") || "Timing change declined by host employee.";
          await rejectRescheduleRequest("/employee", decisionButton.dataset.visitorId, note);
          showToast("Reschedule rejected", "The original timing remains active.");
        }
        await loadEmployeePortal();
      } catch (error) {
        showToast("Reschedule failed", error.message);
      }
      return;
    }
    const rescheduleButton = event.target.closest("[data-direct-reschedule]");
    if (!rescheduleButton) {
      return;
    }
    const dateTime = window.prompt("Enter the new visit date and arrival time as YYYY-MM-DD HH:mm.");
    if (!dateTime) {
      return;
    }
    const scheduledStartTime = toIsoInstant(dateTime.trim().replace(" ", "T"), getDefaultTimezone());
    if (!scheduledStartTime || new Date(scheduledStartTime) <= new Date()) {
      showToast("Invalid timing", "Enter a future date and time.");
      return;
    }
    try {
      await hostRescheduleVisitor("/employee", rescheduleButton.dataset.directReschedule, {
        scheduledStartTime,
        expectedDurationMinutes: 60,
        timezone: getDefaultTimezone(),
        note: "Timing modified by host.",
      });
      showToast("Timing updated", "The previous QR was invalidated and the new access window is active.");
      await loadEmployeePortal();
    } catch (error) {
      showToast("Reschedule failed", error.message);
    }
  });
}

function approvalCard(visitor) {
  return `
    <article class="approval-card">
      <div class="approval-card__media">
        ${visitor.photoUrl ? `<img src="${escapeHtml(visitor.photoUrl)}" alt="${escapeHtml(visitor.fullName)} photo" loading="lazy" />` : ""}
      </div>
      <div class="approval-card__body">
        <div class="approval-card__header">
          <div>
            <h3>${escapeHtml(visitor.fullName)}</h3>
            <p>${escapeHtml(visitor.companyName || "Unlisted company")} · ${escapeHtml(visitor.phone)}</p>
          </div>
          <span class="status-badge status-badge--pending">Pending</span>
        </div>
        <dl class="approval-meta">
          <div><dt>Purpose</dt><dd>${escapeHtml(visitor.purposeOfVisit)}</dd></div>
          <div><dt>Requested</dt><dd>${formatDate(visitor.createdAt)}</dd></div>
          <div><dt>Arrival</dt><dd>${formatDate(visitor.scheduledStartTime)}</dd></div>
          <div><dt>Access window</dt><dd>${formatDate(visitor.accessWindowStartTime)} - ${formatTime(visitor.accessWindowEndTime)}</dd></div>
          ${visitor.rescheduleStatus === "PENDING" ? `<div><dt>Requested timing</dt><dd>${formatDate(visitor.pendingScheduledStartTime)}</dd></div>` : ""}
        </dl>
        ${approvalTimeline(visitor.statusHistory)}
        <label class="form-field">
          <span>Decision note</span>
          <input data-approval-note type="text" maxlength="240" placeholder="Optional approval or rejection note" />
        </label>
        <div class="approval-card__actions">
          <button class="button button--ghost" type="button" data-approval-action="reject" data-visitor-id="${escapeHtml(visitor.id)}">Reject</button>
          <button class="button button--primary" type="button" data-approval-action="approve" data-visitor-id="${escapeHtml(visitor.id)}">Approve</button>
          ${visitor.rescheduleStatus === "PENDING" ? `<button class="button button--ghost" type="button" data-approval-action="reject-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Reject timing</button><button class="button button--primary" type="button" data-approval-action="approve-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Approve timing</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function approvalTimeline(history = []) {
  const items = history.map((entry) => `
    <li>
      <strong>${escapeHtml(formatStatus(entry.status))}</strong>
      <span>${formatDate(entry.timestamp)}</span>
      ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
    </li>
  `).join("");
  return `<ol class="approval-timeline">${items}</ol>`;
}

function setApprovalLoading(card, loading) {
  card?.querySelectorAll("button").forEach((button) => {
    button.toggleAttribute("disabled", loading);
    button.classList.toggle("is-loading", loading);
  });
}

function preApprovalPayload(form, timezone) {
  const data = Object.fromEntries(new FormData(form).entries());
  const phone = phonePayload(data);
  return {
    fullName: trim(data.fullName),
    phoneCountryCode: phone.phoneCountryCode,
    phone: phone.phone,
    email: trim(data.email),
    companyName: trim(data.companyName),
    purposeOfVisit: trim(data.purposeOfVisit),
    scheduledStartTime: toIsoInstant(data.scheduledStartTime, timezone),
    scheduledEndTime: toIsoInstant(data.scheduledEndTime, timezone),
    timezone,
    note: trim(data.note),
  };
}

function validatePreApproval(payload) {
  if (!payload.fullName || payload.fullName.length < 2) {
    return "Enter the visitor full name.";
  }
  const phoneError = validatePhonePayload(payload);
  if (phoneError) {
    return phoneError;
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "Enter a valid email address.";
  }
  if (!payload.purposeOfVisit || payload.purposeOfVisit.length < 2) {
    return "Enter the purpose of visit.";
  }
  const start = new Date(payload.scheduledStartTime);
  const end = new Date(payload.scheduledEndTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Choose a valid start and end time.";
  }
  if (start <= new Date()) {
    return "Choose a future start time.";
  }
  if (end <= start) {
    return "Choose an end time after the start.";
  }
  if (end - start < 15 * 60 * 1000) {
    return "The visit window must be at least 15 minutes.";
  }
  return "";
}

function timezoneLabelText(timezone) {
  return timezoneLabel(timezone);
}

function setScheduleMinimums(form) {
  const start = form.querySelector("[name='scheduledStartTime']");
  const end = form.querySelector("[name='scheduledEndTime']");
  const min = toDatetimeLocal(new Date(Date.now() + 5 * 60 * 1000), getDefaultTimezone());
  start?.setAttribute("min", min);
  end?.setAttribute("min", min);
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
