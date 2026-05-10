import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { approveVisitor, preApproveVisitor, rejectVisitor } from "../shared/visitorApi.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["approvals", "pre-approvals", "notifications", "scheduled", "history"];
let approvalPollTimer;

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
  initApprovalActions();
  initPreApprovalForm();
  await loadEmployeePortal();
  approvalPollTimer = window.setInterval(() => loadApprovals(false), 15000);
  window.addEventListener("beforeunload", () => window.clearInterval(approvalPollTimer));
});

async function loadEmployeePortal() {
  try {
    const [overview, notifications, scheduled] = await Promise.all([
      request("/employee/overview"),
      request("/employee/notifications"),
      request("/employee/scheduled-visitors"),
    ]);

    renderMetrics(overview.data.metrics);
    await loadApprovals(false);
    renderWorkList("#notifications-list", notifications.data, (notification) => workCard(notification.title, notification.message));
    renderScheduledVisitors(scheduled.data || []);
  } catch (error) {
    showToast("Employee access blocked", error.message);
  }
}

function initPreApprovalForm() {
  const form = document.querySelector("#preapproval-form");
  if (!form) {
    return;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timezoneLabel = document.querySelector("#preapproval-timezone");
  if (timezoneLabel) {
    timezoneLabel.textContent = `Times use ${timezone}`;
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
    const items = approvals.data?.items || [];
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
      await loadApprovals(false);
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
  const windowText = `${formatDate(visitor.scheduledStartTime)} - ${formatTime(visitor.scheduledEndTime)}`;
  const company = visitor.companyName || "Unlisted company";
  const status = formatStatus(visitor.status);
  return `
    <article class="scheduled-card">
      <div>
        <h3>${escapeHtml(visitor.fullName)}</h3>
        <p>${escapeHtml(company)} · ${escapeHtml(visitor.purposeOfVisit)}</p>
      </div>
      <dl>
        <div><dt>Window</dt><dd>${escapeHtml(windowText)}</dd></div>
        <div><dt>Pass</dt><dd>${escapeHtml(visitor.qrCode || "Pending")}</dd></div>
      </dl>
      <div class="scheduled-card__footer">
        <span>${escapeHtml(visitor.scheduledTimezone || "UTC")}</span>
        <span class="status-badge status-badge--${String(visitor.status).toLowerCase().replaceAll("_", "-")}">${escapeHtml(status)}</span>
      </div>
    </article>
  `;
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
        </dl>
        ${approvalTimeline(visitor.statusHistory)}
        <label class="form-field">
          <span>Decision note</span>
          <input data-approval-note type="text" maxlength="240" placeholder="Optional approval or rejection note" />
        </label>
        <div class="approval-card__actions">
          <button class="button button--ghost" type="button" data-approval-action="reject" data-visitor-id="${escapeHtml(visitor.id)}">Reject</button>
          <button class="button button--primary" type="button" data-approval-action="approve" data-visitor-id="${escapeHtml(visitor.id)}">Approve</button>
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
  return {
    fullName: trim(data.fullName),
    phone: trim(data.phone),
    email: trim(data.email),
    companyName: trim(data.companyName),
    purposeOfVisit: trim(data.purposeOfVisit),
    scheduledStartTime: toIsoInstant(data.scheduledStartTime),
    scheduledEndTime: toIsoInstant(data.scheduledEndTime),
    timezone,
    note: trim(data.note),
  };
}

function validatePreApproval(payload) {
  if (!payload.fullName || payload.fullName.length < 2) {
    return "Enter the visitor full name.";
  }
  if (!payload.phone || payload.phone.length < 7) {
    return "Enter a valid phone number.";
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

function setScheduleMinimums(form) {
  const start = form.querySelector("[name='scheduledStartTime']");
  const end = form.querySelector("[name='scheduledEndTime']");
  const min = toDatetimeLocal(new Date(Date.now() + 5 * 60 * 1000));
  start?.setAttribute("min", min);
  end?.setAttribute("min", min);
}

function setFormLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button?.toggleAttribute("disabled", loading);
  button?.classList.toggle("is-loading", loading);
}

function formatStatus(status) {
  return String(status || "").replaceAll("_", " ");
}

function formatDate(value) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
  }).format(new Date(value));
}

function toIsoInstant(value) {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function toDatetimeLocal(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}
