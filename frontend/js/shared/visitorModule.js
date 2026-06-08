import {
  checkInVisitor,
  checkOutVisitor,
  createVisitor,
  deleteVisitor,
  denyVisitorEntry,
  escalateVisitorIssue,
  overrideCheckInVisitor,
  reactivateVisitorAccess,
  reportVisitorMismatch,
  revokeVisitorAccess,
  searchVisitors,
  suspendVisitorAccess,
  uploadVisitorPhoto,
} from "./accessService.js";
import { formatDate, formatDurationMinutes, getDefaultTimezone, minutesBetween, timezoneLabel, toIsoInstant } from "./formatters.js";
import { initHostPicker } from "./hostPicker.js";
import { initOrganizationSelectors } from "./organizationSelector.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "./phoneInput.js";
import { createNonOverlappingPoller, renderHtmlIfChanged, renderMappedList } from "./performance.js";
import { showToast } from "./toast.js";
import { VISITOR_STATUS_LABELS as STATUS_LABELS, statusBadgeClass } from "./workflowEnums.js";
import { promptAction } from "./actionModal.js";

const VISITOR_TYPE_LABELS = {
  ONE_TIME: "One-time visitor",
  WALK_IN: "Walk-in visitor",
  EMERGENCY: "Emergency access",
  RECURRING: "Recurring visitor",
  CONTRACTOR_VENDOR: "Contractor / vendor",
};

export function initVisitorModule(selector, options) {
  const root = document.querySelector(selector);
  if (!root) {
    return;
  }

  const state = {
    page: 0,
    size: 10,
    query: "",
    status: "",
    totalPages: 0,
    items: [],
    photoBlob: null,
    photoPreviewUrl: "",
    photoAccepted: false,
    stream: null,
    loading: false,
    pendingLoad: false,
    loadRevision: 0,
  };

  root.classList.add("visitor-system");
  root.innerHTML = template(options);

  const form = root.querySelector("[data-visitor-form]");
  const searchInput = root.querySelector("[data-visitor-search]");
  const statusFilter = root.querySelector("[data-visitor-status]");
  const pageSize = root.querySelector("[data-visitor-size]");
  initPhoneInput(form);
  initCamera(root, state);
  if (options.showOrganizationCodeField) {
    initOrganizationSelectors(root, { prefetch: true });
  }
  if (options.showHostFields !== false) {
    initHostPicker(root, { basePath: options.basePath });
  }
  initRecurringFields(root, options);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formPayload(form, options);
    const error = validate(payload, options, state);
    if (error) {
      showToast("Check visitor details", error);
      return;
    }

    setFormLoading(form, true);
    try {
      const photo = await uploadVisitorPhoto(options.basePath, state.photoBlob);
      const photoData = photo?.data || {};
      if (!photoData.url) {
        throw new Error("Photo upload response was empty.");
      }
      payload.photoUrl = photoData.url;
      payload.photoPublicId = photoData.publicId;
      const created = await createVisitor(options.basePath, payload);
      form.reset();
      resetPhotoState(root, state);
      const visitor = created?.data || {};
      const registeredRecurring = isRecurring(visitor) || payload.visitorType === "RECURRING" || payload.visitorType === "CONTRACTOR_VENDOR";
      showToast(
        registeredRecurring ? "Recurring profile created" : "Visitor registered",
        registeredRecurring ? "Reusable badge access is ready for QR verification." : "Approval request submitted. Badge and QR stay inactive until approved."
      );
      state.page = 0;
      await load();
    } catch (error) {
      showToast("Registration failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });

  searchInput?.addEventListener("input", debounce(async (event) => {
    state.query = event.target.value.trim();
    state.page = 0;
    await load();
  }, 300));

  statusFilter?.addEventListener("change", async (event) => {
    state.status = event.target.value;
    state.page = 0;
    await load();
  });

  pageSize?.addEventListener("change", async (event) => {
    state.size = Number(event.target.value);
    state.page = 0;
    await load();
  });

  root.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-visitor-action]");
    if (!action) {
      return;
    }
    const id = action.dataset.visitorId;
    const type = action.dataset.visitorAction;
    if (type === "detail") {
      openDetail(root, state.items.find((item) => item.id === id));
      return;
    }
    if (type === "capture-photo") {
      await capturePhoto(root, state);
      return;
    }
    if (type === "accept-photo") {
      acceptPhoto(root, state);
      return;
    }
    if (type === "retake-photo") {
      retakePhoto(root, state);
      return;
    }
    if (type === "close-photo-preview") {
      closePhotoPreview(root);
      return;
    }
    if (type === "close-modal") {
      closeDetail(root);
      return;
    }
    if (type === "export") {
      exportVisitors(state.items, options.title || "visitor-log");
      return;
    }
    if (type === "prev" && state.page > 0) {
      state.page -= 1;
      await load();
      return;
    }
    if (type === "next" && state.page + 1 < state.totalPages) {
      state.page += 1;
      await load();
      return;
    }
    await mutate(type, id);
  });

  async function mutate(type, id) {
    const buttons = Array.from(root.querySelectorAll("[data-visitor-id]")).filter((button) => button.dataset.visitorId === id);
    buttons.forEach((button) => {
      button.toggleAttribute("disabled", true);
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
    });
    try {
      if (type === "check-in") {
        await checkInVisitor(options.basePath, id);
        showToast("Checked in", "Visitor status updated.");
      }
      if (type === "override-check-in") {
        const reason = await promptAction({
          title: "Manual visitor check-in",
          message: "Record why this visitor can be checked in after photo and identity verification.",
          label: "Override reason",
          placeholder: "Photo and ID verified at checkpoint",
          confirmLabel: "Record override",
          minLength: 8,
          multiline: true,
        });
        if (!reason || reason.trim().length < 8) {
          showToast("Override reason required", "Enter at least 8 characters before manual check-in.");
          return;
        }
        await overrideCheckInVisitor(options.basePath, id, reason.trim());
        showToast("Override recorded", "Visitor checked in with an audit trail.");
      }
      if (type === "check-out") {
        await checkOutVisitor(options.basePath, id);
        showToast("Checked out", "Visitor status updated.");
      }
      if (type === "deny-entry") {
        const reason = await promptOperationalReason("Deny visitor entry", "Record why this visitor must be denied at the checkpoint.", "Deny entry");
        if (!reason) {
          return;
        }
        await denyVisitorEntry(options.basePath, id, reason);
        showToast("Entry denied", "Visitor denial was recorded with audit history.");
      }
      if (type === "suspend") {
        const reason = await promptOperationalReason("Suspend recurring access", "Record why recurring access should be paused.", "Suspend access");
        if (!reason) {
          return;
        }
        await suspendVisitorAccess(options.basePath, id, reason);
        showToast("Access suspended", "Recurring visitor access was suspended.");
      }
      if (type === "revoke") {
        const reason = await promptOperationalReason("Revoke recurring access", "Record why recurring access should be revoked.", "Revoke access");
        if (!reason) {
          return;
        }
        await revokeVisitorAccess(options.basePath, id, reason);
        showToast("Access revoked", "Recurring visitor access was revoked.");
      }
      if (type === "reactivate") {
        await reactivateVisitorAccess(options.basePath, id);
        showToast("Access reactivated", "Recurring visitor access was restored.");
      }
      if (type === "escalate") {
        const reason = await promptOperationalReason("Escalate visitor issue", "Record the issue for admin, host, or lead guard follow-up.", "Escalate");
        if (!reason) {
          return;
        }
        await escalateVisitorIssue(options.basePath, id, reason);
        showToast("Escalation recorded", "Visitor issue was added to the operational history.");
      }
      if (type === "mismatch") {
        const reason = await promptOperationalReason("Report visitor mismatch", "Record what did not match between the person, badge, and approved profile.", "Report mismatch");
        if (!reason) {
          return;
        }
        await reportVisitorMismatch(options.basePath, id, reason);
        showToast("Mismatch recorded", "Visitor mismatch was recorded with audit history.");
      }
      if (type === "delete" && options.canDelete) {
        await deleteVisitor(options.basePath, id);
        showToast("Deleted", "Visitor record removed.");
      }
      await load();
    } catch (error) {
      showToast("Action failed", error.message);
    } finally {
      buttons.forEach((button) => {
        button.toggleAttribute("disabled", false);
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      });
    }
  }

  const pollInterval = options.pollIntervalMs ?? 30000;
  let poller;
  if (pollInterval > 0) {
    poller = createNonOverlappingPoller(() => load(false), {
      intervalMs: pollInterval,
      backgroundIntervalMs: Math.max(120000, pollInterval * 3),
      immediate: false,
    });
    poller.start();
    window.addEventListener("beforeunload", () => poller?.stop(), { once: true });
  }

  async function load(showSkeleton = true) {
    if (state.loading) {
      state.loadRevision += 1;
      state.pendingLoad = true;
      return;
    }
    const revision = ++state.loadRevision;
    state.loading = true;
    state.pendingLoad = false;
    if (showSkeleton) {
      renderSkeleton(root);
    }
    try {
      const response = await searchVisitors(options.basePath, {
        page: state.page,
        size: state.size,
        query: state.query,
        status: state.status,
        sortBy: "createdAt",
        direction: "desc",
      });
      const pageData = response?.data || {};
      if (revision !== state.loadRevision) {
        return;
      }
      state.items = pageData.items || [];
      state.totalPages = pageData.totalPages || 0;
      renderRows(root, state, options);
      renderPagination(root, state, pageData.totalItems || 0);
    } catch (error) {
      if (revision !== state.loadRevision) {
        return;
      }
      state.items = [];
      renderRows(root, state, options, error.message);
      renderPagination(root, state, 0);
      showToast("Visitors unavailable", error.message);
    } finally {
      state.loading = false;
      if (state.pendingLoad) {
        void load(false);
      }
    }
  }

  load();
}

function template(options) {
  const hostFields = options.showHostFields === false ? "" : `
    <div class="form-field form-field--wide">
      <span>Host Employee</span>
      <div class="host-picker">
        <input data-host-search-input type="text" placeholder="Search employee name, email, or username" autocomplete="off" />
        <input data-host-id name="hostEmployeeId" type="hidden" />
        <input data-host-name name="hostEmployee" type="hidden" />
        <div class="host-picker__meta" data-host-meta></div>
        <div class="host-picker__results is-hidden" data-host-results></div>
      </div>
    </div>
  `;
  const organizationCodeField = options.showOrganizationCodeField ? `
      <label class="form-field">
        <span>Organization</span>
        <input name="companyCode" type="hidden" data-organization-selector data-organization-label="Visitor organization" value="${escapeHtml(options.organizationCode || "")}" />
      </label>
  ` : "";
  const companyField = options.showCompanyField === false ? "" : `
      <label class="form-field">
        <span>Company Name</span>
        <input name="companyName" type="text" autocomplete="organization" placeholder="Company name" />
      </label>
  `;
  const recurringFields = options.enableRecurring ? `
      <label class="form-field">
        <span>Visitor Type</span>
        <select name="visitorType" data-visitor-type>
          <option value="ONE_TIME">One-Time Visitor</option>
          <option value="WALK_IN">Walk-in Visitor</option>
          <option value="EMERGENCY">Emergency Access</option>
          <option value="RECURRING">Recurring Visitor</option>
          <option value="CONTRACTOR_VENDOR">Contractor/Vendor</option>
        </select>
      </label>
      <div class="visitor-recurring-fields form-field--wide is-hidden" data-recurring-fields>
        <label class="form-field">
          <span>Vendor / Company Name</span>
          <input name="vendorCompanyName" type="text" autocomplete="organization" placeholder="Vendor or contractor company" />
        </label>
        <label class="form-field">
          <span>Sponsor Employee</span>
          <input name="sponsorEmployee" type="text" placeholder="Sponsor or site owner" />
        </label>
        <label class="form-field">
          <span>Department</span>
          <input name="department" type="text" placeholder="Department or service area" />
        </label>
        <label class="form-field">
          <span>Validity Start</span>
          <input name="validityStartDate" type="datetime-local" />
        </label>
        <label class="form-field">
          <span>Validity End</span>
          <input name="validityEndDate" type="datetime-local" />
        </label>
        <label class="form-field">
          <span>Recurring Schedule</span>
          <input name="recurringSchedule" type="text" placeholder="Daily, weekly, shift pattern" />
        </label>
        <label class="form-field form-field--wide">
          <span>Allowed Weekdays</span>
          <div class="weekday-picker">
            ${["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => `<label><input type="checkbox" name="allowedWeekdays" value="${day}" />${day}</label>`).join("")}
          </div>
        </label>
        <label class="form-field">
          <span>Entry Window Start</span>
          <input name="allowedEntryStartTime" type="time" />
        </label>
        <label class="form-field">
          <span>Entry Window End</span>
          <input name="allowedEntryEndTime" type="time" />
        </label>
        <label class="form-field">
          <span>Emergency Contact</span>
          <input name="emergencyContact" type="text" autocomplete="tel" placeholder="Emergency phone or contact" />
        </label>
        <label class="form-field form-field--wide">
          <span>Notes</span>
          <textarea name="notes" rows="3" placeholder="Access notes, restrictions, or service area"></textarea>
        </label>
      </div>
  ` : "";
  const scheduleFields = `
      <div class="visitor-schedule-fields form-field--wide" data-schedule-fields>
        <label class="form-field">
          <span>Visit Date and Arrival</span>
          <input name="scheduledStartTime" type="datetime-local" />
        </label>
        <label class="form-field">
          <span>Expected Duration</span>
          <select name="expectedDurationMinutes">
            <option value="">1 hour</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
            <option value="120">2 hours</option>
            <option value="240">4 hours</option>
            <option value="480">Full day</option>
          </select>
        </label>
        <small class="form-hint">Access window opens 1 hour before arrival and expires 1 hour after the expected end in ${escapeHtml(timezoneLabel(getDefaultTimezone()))}.</small>
      </div>
  `;

  return `
    <div class="panel__header">
      <div>
        <p class="eyebrow">${escapeHtml(options.eyebrow || "Visitors")}</p>
        <h2>${escapeHtml(options.title || "Visitor Registration")}</h2>
      </div>
    </div>

    <form class="visitor-form" data-visitor-form novalidate>
      <label class="form-field">
        <span>Full Name</span>
        <input name="fullName" type="text" autocomplete="name" placeholder="Visitor full name" required />
      </label>
      <label class="form-field">
        <span>Phone</span>
        <input name="phone" type="tel" autocomplete="tel" placeholder="+1 555 0100" required />
      </label>
      <label class="form-field">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" placeholder="visitor@company.com" />
      </label>
      ${companyField}
      ${recurringFields}
      ${scheduleFields}
      ${organizationCodeField}
      <label class="form-field form-field--wide">
        <span>Purpose of Visit</span>
        <input name="purposeOfVisit" type="text" placeholder="Purpose of visit" required />
      </label>
      ${hostFields}
      <section class="visitor-camera form-field--wide" aria-label="Visitor photo capture">
        <div class="visitor-camera__stage">
          <video data-camera-video autoplay playsinline muted></video>
          <img data-camera-still alt="Captured visitor preview" class="is-hidden" />
          <div class="visitor-camera__empty" data-camera-empty>Camera unavailable</div>
        </div>
        <div class="visitor-camera__controls">
          <div>
            <strong>Visitor photo</strong>
            <span data-camera-status>Starting camera...</span>
          </div>
          <button class="button button--ghost" type="button" data-visitor-action="capture-photo">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h2l1.2-2h3.6L15 6h2a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Zm5 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"/></svg>
            Capture
          </button>
        </div>
      </section>
      <button class="button button--primary visitor-form__submit" type="submit">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>
        Register Visitor
      </button>
    </form>

    <div class="visitor-toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 18.6-4.2-4.2a7 7 0 1 0-1.4 1.4l4.2 4.2ZM5 10a5 5 0 1 1 5 5 5 5 0 0 1-5-5Z"/></svg>
        <input data-visitor-search type="search" placeholder="Search name, phone, company, host, QR" />
      </label>
      <select data-visitor-status aria-label="Filter visitor status">
        <option value="">All statuses</option>
        <option value="PENDING">Pending approval</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Denied</option>
        <option value="CHECKED_IN">Checked in</option>
        <option value="CHECKED_OUT">Checked out</option>
        <option value="EXPIRED">Expired</option>
        <option value="SUSPENDED">Suspended</option>
      </select>
      <select data-visitor-size aria-label="Rows per page">
        <option value="10">10 rows</option>
        <option value="20">20 rows</option>
        <option value="50">50 rows</option>
      </select>
      <button class="button button--ghost" type="button" data-visitor-action="export">Export CSV</button>
    </div>

    <div class="visitor-table-wrap">
      <table class="visitor-table">
        <thead>
          <tr>
            <th>Visitor</th>
            <th>Company</th>
            <th>Host</th>
            <th>Status</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>QR Code</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody data-visitor-rows></tbody>
      </table>
    </div>
    <div class="empty-state compact is-hidden" data-visitor-empty>
      <h3>No visitor records</h3>
      <p>Register a visitor or adjust the search filters.</p>
    </div>
    <div class="visitor-pagination" data-visitor-pagination></div>
    <div class="visitor-modal is-hidden" data-visitor-modal></div>
    <div class="visitor-modal is-hidden" data-photo-modal></div>
  `;
}

function initRecurringFields(root, options) {
  const typeSelect = root.querySelector("[data-visitor-type]");
  const section = root.querySelector("[data-recurring-fields]");
  const schedule = root.querySelector("[data-schedule-fields]");
  const sync = () => {
    const recurring = typeSelect?.value === "RECURRING" || typeSelect?.value === "CONTRACTOR_VENDOR";
    section?.classList.toggle("is-hidden", !recurring);
    schedule?.classList.toggle("is-hidden", recurring || typeSelect?.value === "WALK_IN" || typeSelect?.value === "EMERGENCY");
  };
  typeSelect?.addEventListener("change", sync);
  sync();
}

function renderSkeleton(root) {
  const rows = root.querySelector("[data-visitor-rows]");
  root.querySelector("[data-visitor-empty]")?.classList.add("is-hidden");
  if (!rows) {
    return;
  }
  renderHtmlIfChanged(rows, Array.from({ length: 5 }).map(() => `
    <tr class="visitor-row--skeleton">
      <td><span></span><small></small></td>
      <td><span></span></td>
      <td><span></span></td>
      <td><span></span></td>
      <td><span></span></td>
      <td><span></span></td>
      <td><span></span></td>
      <td><span></span></td>
    </tr>
  `).join(""));
}

function renderRows(root, state, options, errorMessage = "") {
  const rows = root.querySelector("[data-visitor-rows]");
  const empty = root.querySelector("[data-visitor-empty]");
  if (!rows || !empty) {
    return;
  }

  empty.classList.toggle("is-hidden", state.items.length > 0);
  if (errorMessage) {
    empty.querySelector("h3").textContent = "Visitor records unavailable";
    empty.querySelector("p").textContent = errorMessage;
  } else {
    empty.querySelector("h3").textContent = "No visitor records";
    empty.querySelector("p").textContent = "Register a visitor or adjust the search filters.";
  }
  renderMappedList(rows, state.items, (visitor) => row(visitor, options), { batchSize: 25 });
}

function row(visitor, options) {
  return `
    <tr>
      <td data-label="Visitor">
        <strong>${escapeHtml(visitor.fullName)}</strong>
        <small>${escapeHtml(visitor.phone)}${visitor.email ? ` · ${escapeHtml(visitor.email)}` : ""}</small>
        <small>${escapeHtml(VISITOR_TYPE_LABELS[visitor.visitorType] || "One-time visitor")}</small>
        ${visitor.accessWindowStartTime && visitor.accessWindowEndTime ? `<small>Window ${escapeHtml(formatWindow(visitor.accessWindowStartTime, visitor.accessWindowEndTime, visitor.organizationTimezone))}</small>` : ""}
      </td>
      <td data-label="Company">${escapeHtml(visitor.companyName || "Unlisted")}</td>
      <td data-label="Host">${escapeHtml(visitor.hostEmployee || visitor.hostEmployeeId || "Unassigned")}</td>
      <td data-label="Status">${statusBadge(visitor.status)}</td>
      <td data-label="Check-in">${formatDate(visitor.checkInTime)}</td>
      <td data-label="Check-out">${formatDate(visitor.checkOutTime)}</td>
      <td data-label="QR Code"><code>${escapeHtml(visitor.qrCode)}</code></td>
      <td data-label="Actions">
        <div class="table-actions">
          <button class="icon-button" type="button" title="View details" data-visitor-action="detail" data-visitor-id="${escapeHtml(visitor.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7s-9-4.5-10-7c1-2.5 5-7 10-7Zm0 10a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"/></svg>
          </button>
          ${visitor.status === "APPROVED" && !visitor.preApproved ? actionButton("check-in", visitor.id, "Check in") : ""}
          ${visitor.status === "APPROVED" && visitor.preApproved ? actionButton("override-check-in", visitor.id, "Override check-in") : ""}
          ${visitor.status === "CHECKED_OUT" && isRecurring(visitor) ? actionButton("override-check-in", visitor.id, "Override recurring check-in") : ""}
          ${visitor.status === "CHECKED_IN" ? actionButton("check-out", visitor.id, "Check out") : ""}
          ${visitor.status !== "REJECTED" ? actionButton("deny-entry", visitor.id, "Deny entry") : ""}
          ${isRecurring(visitor) && visitor.status !== "SUSPENDED" ? actionButton("suspend", visitor.id, "Suspend recurring access") : ""}
          ${isRecurring(visitor) && visitor.status !== "REJECTED" ? actionButton("revoke", visitor.id, "Revoke recurring access") : ""}
          ${visitor.status === "SUSPENDED" && isRecurring(visitor) ? actionButton("reactivate", visitor.id, "Reactivate recurring access") : ""}
          ${actionButton("escalate", visitor.id, "Escalate issue")}
          ${actionButton("mismatch", visitor.id, "Report mismatch")}
          ${options.canDelete ? actionButton("delete", visitor.id, "Delete") : ""}
        </div>
      </td>
    </tr>
  `;
}

function actionButton(action, id, label) {
  const icon = iconForAction(action);
  return `
    <button class="icon-button" type="button" title="${label}" data-visitor-action="${action}" data-visitor-id="${escapeHtml(id)}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
    </button>
  `;
}

function iconForAction(action) {
  if (action === "delete" || action === "revoke" || action === "deny-entry") {
    return '<path d="M6.4 5 19 17.6 17.6 19 5 6.4Zm5.6-3a10 10 0 0 1 8.7 14.9L7.1 3.3A10 10 0 0 1 12 2ZM3.3 7.1l13.6 13.6A10 10 0 0 1 3.3 7.1Z"/>';
  }
  if (action === "suspend") {
    return '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2ZM7 11h10v2H7Z"/>';
  }
  if (action === "reactivate") {
    return '<path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h8V3Z"/>';
  }
  if (action === "escalate") {
    return '<path d="M12 2 2 21h20Zm1 14h-2v2h2Zm0-7h-2v5h2Z"/>';
  }
  if (action === "mismatch") {
    return '<path d="M12 3a4 4 0 1 0 4 4 4 4 0 0 0-4-4ZM5 21a7 7 0 0 1 14 0Zm13.6-9.6 1.4 1.4-2.2 2.2 2.2 2.2-1.4 1.4-2.2-2.2-2.2 2.2-1.4-1.4 2.2-2.2-2.2-2.2 1.4-1.4 2.2 2.2Z"/>';
  }
  return '<path d="m9 16.2-3.5-3.5L4 14.2 9 19 20 8l-1.5-1.5Z"/>';
}

function isRecurring(visitor) {
  return visitor?.visitorType === "RECURRING" || visitor?.visitorType === "CONTRACTOR_VENDOR";
}

function renderPagination(root, state, totalItems) {
  const pagination = root.querySelector("[data-visitor-pagination]");
  if (!pagination) {
    return;
  }
  const start = totalItems === 0 ? 0 : state.page * state.size + 1;
  const end = Math.min((state.page + 1) * state.size, totalItems);
  renderHtmlIfChanged(pagination, `
    <span>${start}-${end} of ${totalItems}</span>
    <div>
      <button class="button button--ghost" type="button" data-visitor-action="prev" ${state.page === 0 ? "disabled" : ""}>Previous</button>
      <button class="button button--ghost" type="button" data-visitor-action="next" ${state.page + 1 >= state.totalPages ? "disabled" : ""}>Next</button>
    </div>
  `);
}

function openDetail(root, visitor) {
  const modal = root.querySelector("[data-visitor-modal]");
  if (!modal || !visitor) {
    return;
  }
  modal.classList.remove("is-hidden");
  modal.innerHTML = `
    <div class="visitor-modal__dialog" role="dialog" aria-modal="true" aria-label="Visitor detail">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Visitor Detail</p>
          <h2>${escapeHtml(visitor.fullName)}</h2>
        </div>
        <button class="icon-button" type="button" aria-label="Close visitor detail" data-visitor-action="close-modal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      <dl class="visitor-detail">
        ${detail("Status", STATUS_LABELS[visitor.status] || visitor.status)}
        ${detail("Phone", visitor.phone)}
        ${detail("Email", visitor.email || "Unlisted")}
        ${detail("Company", visitor.companyName || "Unlisted")}
        ${detail("Visitor Type", VISITOR_TYPE_LABELS[visitor.visitorType] || "One-time visitor")}
        ${detail("Vendor / Company", visitor.vendorCompanyName || visitor.companyName || "Unlisted")}
        ${detail("Organization", visitor.organizationName || visitor.organizationCode || "Unlisted")}
        ${detail("Purpose", visitor.purposeOfVisit)}
        ${detail("Host Employee", visitor.hostEmployee || visitor.hostEmployeeId || "Unassigned")}
        ${detail("Host Department", visitor.hostEmployeeDepartment || "Not recorded")}
        ${detail("Sponsor Employee", visitor.sponsorEmployee || "Not recorded")}
        ${detail("Department", visitor.department || "Not recorded")}
        ${detail("Validity Start", formatDate(visitor.validityStartDate))}
        ${detail("Validity End", formatDate(visitor.validityEndDate))}
        ${detail("Allowed Weekdays", (visitor.allowedWeekdays || []).join(", ") || "Any")}
        ${detail("Entry Window", visitor.allowedEntryStartTime && visitor.allowedEntryEndTime ? `${visitor.allowedEntryStartTime} to ${visitor.allowedEntryEndTime}` : "Any")}
        ${detail("Emergency Contact", visitor.emergencyContact || "Not recorded")}
        ${detail("Notes", visitor.notes || "None")}
        ${detail("Badge ID", visitor.badgeId || "Not issued")}
        ${detail("Scheduled Start", formatDate(visitor.scheduledStartTime))}
        ${detail("Scheduled End", formatDate(visitor.scheduledEndTime))}
        ${detail("Access Window", formatWindow(visitor.accessWindowStartTime, visitor.accessWindowEndTime, visitor.organizationTimezone))}
        ${detail("Expected Duration", visitor.expectedDurationMinutes ? formatDurationMinutes(visitor.expectedDurationMinutes) : "Not recorded")}
        ${detail("Timezone", visitor.scheduledTimezone || "Not scheduled")}
        ${detail("Reschedule", visitor.rescheduleStatus ? `${visitor.rescheduleStatus}${visitor.pendingScheduledStartTime ? ` · ${formatDate(visitor.pendingScheduledStartTime)}` : ""}` : "None")}
        ${detail("Check-in Time", formatDate(visitor.checkInTime))}
        ${detail("Check-out Time", formatDate(visitor.checkOutTime))}
        ${detail("Visit Duration", formatDurationMinutes(minutesBetween(visitor.checkInTime, visitor.checkOutTime || new Date())))}
        ${photoDetail(visitor.photoUrl)}
        ${detail("QR Code", visitor.qrCode)}
        ${timelineDetail(visitor.statusHistory)}
      </dl>
    </div>
  `;
}

function closeDetail(root) {
  root.querySelector("[data-visitor-modal]")?.classList.add("is-hidden");
}

function detail(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function photoDetail(photoUrl) {
  if (!photoUrl) {
    return detail("Photo", "Not captured");
  }
  return `
    <div class="visitor-detail__photo">
      <dt>Photo</dt>
      <dd><img src="${escapeHtml(photoUrl)}" alt="Visitor photo" loading="lazy" /></dd>
    </div>
  `;
}

function timelineDetail(history = []) {
  const items = history.map((entry) => `
    <li>
      <strong>${escapeHtml(STATUS_LABELS[entry.status] || entry.status)}</strong>
      <span>${formatDate(entry.timestamp)}</span>
      ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
    </li>
  `).join("");
  return `
    <div class="visitor-detail__timeline">
      <dt>Status Timeline</dt>
      <dd><ol>${items || "<li><strong>No status history</strong></li>"}</ol></dd>
    </div>
  `;
}

function formPayload(form, options) {
  const data = Object.fromEntries(new FormData(form).entries());
  const phone = phonePayload(data);
  const payload = {
    fullName: trim(data.fullName),
    phoneCountryCode: phone.phoneCountryCode,
    phone: phone.phone,
    email: trim(data.email),
    companyCode: trim(data.companyCode) || options.organizationCode || null,
    purposeOfVisit: trim(data.purposeOfVisit),
  };
  if (options.showCompanyField !== false) {
    payload.companyName = trim(data.companyName);
  }
  payload.scheduledStartTime = toIsoInstant(data.scheduledStartTime, getDefaultTimezone());
  payload.expectedDurationMinutes = data.expectedDurationMinutes ? Number(data.expectedDurationMinutes) : 60;
  payload.timezone = getDefaultTimezone();
  if (options.showHostFields !== false) {
    payload.hostEmployee = trim(data.hostEmployee);
    payload.hostEmployeeId = trim(data.hostEmployeeId);
  }
  if (options.enableRecurring) {
    payload.visitorType = trim(data.visitorType) || "ONE_TIME";
    if (payload.visitorType === "RECURRING" || payload.visitorType === "CONTRACTOR_VENDOR") {
      payload.vendorCompanyName = trim(data.vendorCompanyName);
      payload.sponsorEmployee = trim(data.sponsorEmployee);
      payload.department = trim(data.department);
      payload.validityStartDate = dateTimeLocalToIso(data.validityStartDate);
      payload.validityEndDate = dateTimeLocalToIso(data.validityEndDate);
      payload.recurringSchedule = trim(data.recurringSchedule);
      payload.allowedWeekdays = new FormData(form).getAll("allowedWeekdays");
      payload.allowedEntryStartTime = trim(data.allowedEntryStartTime);
      payload.allowedEntryEndTime = trim(data.allowedEntryEndTime);
      payload.emergencyContact = trim(data.emergencyContact);
      payload.notes = trim(data.notes);
    }
    if (payload.visitorType === "WALK_IN" || payload.visitorType === "EMERGENCY") {
      payload.scheduledStartTime = null;
      payload.expectedDurationMinutes = null;
    }
  }
  return payload;
}

function validate(payload, options, state) {
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
  if (options.requireOrganizationCode && !payload.companyCode) {
    return "Select the organization.";
  }
  if (options.showHostFields !== false && !payload.hostEmployee && !payload.hostEmployeeId) {
    return "Select a host employee from the directory.";
  }
  if ((!payload.visitorType || payload.visitorType === "ONE_TIME") && !payload.scheduledStartTime) {
    return "Choose the visit date and expected arrival time.";
  }
  if (payload.scheduledStartTime && new Date(payload.scheduledStartTime) <= new Date()) {
    return "Choose a future visit time.";
  }
  if (payload.expectedDurationMinutes && (payload.expectedDurationMinutes < 15 || payload.expectedDurationMinutes > 1440)) {
    return "Expected duration must be between 15 minutes and 24 hours.";
  }
  if (options.enableRecurring && (payload.visitorType === "RECURRING" || payload.visitorType === "CONTRACTOR_VENDOR")) {
    if (!payload.validityStartDate || !payload.validityEndDate) {
      return "Enter validity start and end dates for recurring visitors.";
    }
    if (new Date(payload.validityEndDate) <= new Date(payload.validityStartDate)) {
      return "Validity end must be after the start date.";
    }
    if ((payload.allowedEntryStartTime && !payload.allowedEntryEndTime) || (!payload.allowedEntryStartTime && payload.allowedEntryEndTime)) {
      return "Enter both start and end times for the entry window.";
    }
    if (payload.allowedEntryStartTime && payload.allowedEntryEndTime && payload.allowedEntryEndTime <= payload.allowedEntryStartTime) {
      return "Entry window end must be after the start time.";
    }
  }
  if (!state.photoBlob || !state.photoAccepted) {
    return "Capture the visitor photo.";
  }
  return "";
}

async function promptOperationalReason(title, message, confirmLabel) {
  const reason = await promptAction({
    title,
    message,
    label: "Operational reason",
    placeholder: "Policy reason, identity concern, host request, or incident detail",
    confirmLabel,
    minLength: 8,
    multiline: true,
  });
  if (!reason || reason.trim().length < 8) {
    showToast("Reason required", "Enter at least 8 characters so the action is audit-safe.");
    return "";
  }
  return reason.trim();
}

async function initCamera(root, state) {
  const video = root.querySelector("[data-camera-video]");
  const status = root.querySelector("[data-camera-status]");
  const empty = root.querySelector("[data-camera-empty]");

  if (!video || !navigator.mediaDevices?.getUserMedia) {
    setCameraStatus(status, empty, "Camera is not supported on this browser.", true);
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = state.stream;
    setCameraStatus(status, empty, "Camera ready. Capture is required.", false);
  } catch (error) {
    setCameraStatus(status, empty, "Allow camera access to register visitors.", true);
  }
}

async function capturePhoto(root, state) {
  const video = root.querySelector("[data-camera-video]");
  const status = root.querySelector("[data-camera-status]");
  if (!video || !video.videoWidth) {
    showToast("Camera not ready", "Allow camera access and try again.");
    return;
  }

  const blob = await compressedFrame(video);
  if (!blob) {
    showToast("Capture failed", "The photo could not be captured.");
    return;
  }

  if (state.photoPreviewUrl) {
    URL.revokeObjectURL(state.photoPreviewUrl);
  }
  state.photoBlob = blob;
  state.photoAccepted = false;
  state.photoPreviewUrl = URL.createObjectURL(blob);
  status.textContent = `Captured photo ready (${Math.round(blob.size / 1024)} KB).`;
  openPhotoPreview(root, state.photoPreviewUrl);
}

function openPhotoPreview(root, imageUrl) {
  const modal = root.querySelector("[data-photo-modal]");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-hidden");
  modal.innerHTML = `
    <div class="visitor-modal__dialog visitor-photo-preview" role="dialog" aria-modal="true" aria-label="Visitor photo preview">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Photo Preview</p>
          <h2>Confirm visitor photo</h2>
        </div>
        <button class="icon-button" type="button" aria-label="Close photo preview" data-visitor-action="close-photo-preview">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      <img src="${escapeHtml(imageUrl)}" alt="Captured visitor preview" />
      <div class="visitor-photo-preview__actions">
        <button class="button button--ghost" type="button" data-visitor-action="retake-photo">Retake</button>
        <button class="button button--primary" type="button" data-visitor-action="accept-photo">Use Photo</button>
      </div>
    </div>
  `;
}

function acceptPhoto(root, state) {
  const preview = root.querySelector("[data-camera-still]");
  const video = root.querySelector("[data-camera-video]");
  const modalImage = root.querySelector("[data-photo-modal] img");
  if (preview && modalImage) {
    preview.src = modalImage.src;
    preview.classList.remove("is-hidden");
    video?.classList.add("is-hidden");
  }
  state.photoAccepted = true;
  closePhotoPreview(root);
}

function retakePhoto(root, state) {
  const preview = root.querySelector("[data-camera-still]");
  const video = root.querySelector("[data-camera-video]");
  const status = root.querySelector("[data-camera-status]");
  preview?.classList.add("is-hidden");
  video?.classList.remove("is-hidden");
  state.photoBlob = null;
  state.photoAccepted = false;
  status.textContent = "Camera ready. Capture is required.";
  closePhotoPreview(root);
}

function closePhotoPreview(root) {
  root.querySelector("[data-photo-modal]")?.classList.add("is-hidden");
}

function resetPhotoState(root, state) {
  const preview = root.querySelector("[data-camera-still]");
  const video = root.querySelector("[data-camera-video]");
  const status = root.querySelector("[data-camera-status]");
  preview?.classList.add("is-hidden");
  preview?.removeAttribute("src");
  video?.classList.remove("is-hidden");
  state.photoBlob = null;
  state.photoAccepted = false;
  if (state.photoPreviewUrl) {
    URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoPreviewUrl = "";
  }
  if (status) {
    status.textContent = "Camera ready. Capture is required.";
  }
}

function compressedFrame(video) {
  const canvas = document.createElement("canvas");
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

function setCameraStatus(status, empty, message, unavailable) {
  if (status) {
    status.textContent = message;
  }
  empty?.classList.toggle("is-hidden", !unavailable);
}

function setFormLoading(form, loading) {
  const button = form.querySelector(".visitor-form__submit");
  button?.classList.toggle("is-loading", loading);
  button?.toggleAttribute("disabled", loading);
  button?.toggleAttribute("aria-busy", loading);
}

function exportVisitors(items, label) {
  if (!items.length) {
    showToast("Nothing to export", "Load visitor records before exporting the current log.");
    return;
  }

  const headers = ["Full name", "Phone", "Email", "Visitor type", "Company", "Vendor", "Organization", "Host", "Department", "Status", "Validity start", "Validity end", "Created", "Check-in", "Check-out", "QR code", "Badge ID"];
  const rows = items.map((visitor) => [
    visitor.fullName,
    visitor.phone,
    visitor.email,
    VISITOR_TYPE_LABELS[visitor.visitorType] || visitor.visitorType,
    visitor.companyName,
    visitor.vendorCompanyName,
    visitor.organizationName || visitor.organizationCode,
    visitor.hostEmployee,
    visitor.department || visitor.hostEmployeeDepartment,
    STATUS_LABELS[visitor.status] || visitor.status,
    formatDate(visitor.validityStartDate),
    formatDate(visitor.validityEndDate),
    formatDate(visitor.createdAt),
    formatDate(visitor.checkInTime),
    formatDate(visitor.checkOutTime),
    visitor.qrCode,
    visitor.badgeId,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(label)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="status-badge ${escapeHtml(statusBadgeClass(status))}">${escapeHtml(label)}</span>`;
}

function debounce(callback, delay) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), delay);
  };
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}

function dateTimeLocalToIso(value) {
  const trimmed = trim(value);
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatWindow(start, end, timezone) {
  if (!start || !end) {
    return "Not scheduled";
  }
  const zone = timezone || getDefaultTimezone();
  return `${formatDate(start, { dateStyle: "medium", timeStyle: "short", timeZone: zone })} - ${formatDate(end, { timeStyle: "short", timeZone: zone })} ${timezoneLabel(zone)}`;
}

function csvCell(value) {
  const safe = String(value ?? "").replaceAll('"', '""');
  return `"${safe}"`;
}

function safeFileName(value) {
  return String(value || "visitor-log")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "") || "visitor-log";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
