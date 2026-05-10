import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { approveVisitor, rejectVisitor } from "../shared/visitorApi.js";
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
  await loadEmployeePortal();
  approvalPollTimer = window.setInterval(() => loadApprovals(false), 15000);
  window.addEventListener("beforeunload", () => window.clearInterval(approvalPollTimer));
});

async function loadEmployeePortal() {
  try {
    const [overview, preApprovals, notifications, scheduled] = await Promise.all([
      request("/employee/overview"),
      request("/employee/pre-approvals"),
      request("/employee/notifications"),
      request("/employee/scheduled-visitors"),
    ]);

    renderMetrics(overview.data.metrics);
    await loadApprovals(false);
    renderWorkList("#pre-approvals-list", preApprovals.data, (approval) => workCard(approval.visitor, approval.date, approval.status));
    renderWorkList("#notifications-list", notifications.data, (notification) => workCard(notification.title, notification.message));
    renderWorkList("#scheduled-list", scheduled.data, (visitor) => workCard(visitor.visitor, visitor.time, visitor.status));
  } catch (error) {
    showToast("Employee access blocked", error.message);
  }
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
