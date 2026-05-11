import { checkInVisitor, checkOutVisitor, createVisitor, deleteVisitor, searchVisitors, uploadVisitorPhoto } from "./visitorApi.js";
import { formatDate, formatDurationMinutes, minutesBetween } from "./formatters.js";
import { initHostPicker } from "./hostPicker.js";
import { showToast } from "./toast.js";

const STATUS_LABELS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  EXPIRED: "Expired",
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
  };

  root.classList.add("visitor-system");
  root.innerHTML = template(options);

  const form = root.querySelector("[data-visitor-form]");
  const searchInput = root.querySelector("[data-visitor-search]");
  const statusFilter = root.querySelector("[data-visitor-status]");
  const pageSize = root.querySelector("[data-visitor-size]");
  initCamera(root, state);
  if (options.showHostFields !== false) {
    initHostPicker(root, { basePath: options.basePath });
  }

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
      payload.photoUrl = photo.data.url;
      payload.photoPublicId = photo.data.publicId;
      await createVisitor(options.basePath, payload);
      form.reset();
      resetPhotoState(root, state);
      showToast("Visitor registered", "The visitor record is ready for check-in.");
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
      if (type === "check-out") {
        await checkOutVisitor(options.basePath, id);
        showToast("Checked out", "Visitor status updated.");
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

  const pollInterval = options.pollIntervalMs ?? 15000;
  let pollTimer;
  if (pollInterval > 0) {
    pollTimer = window.setInterval(() => load(false), pollInterval);
    window.addEventListener("beforeunload", () => window.clearInterval(pollTimer));
  }

  async function load(showSkeleton = true) {
    if (state.loading && !showSkeleton) {
      return;
    }
    state.loading = true;
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
      state.items = response.data.items || [];
      state.totalPages = response.data.totalPages || 0;
      renderRows(root, state, options);
      renderPagination(root, state, response.data.totalItems || 0);
    } catch (error) {
      state.items = [];
      renderRows(root, state, options, error.message);
      renderPagination(root, state, 0);
      showToast("Visitors unavailable", error.message);
    } finally {
      state.loading = false;
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
        <span>Organization Code</span>
        <input name="companyCode" type="text" autocomplete="organization" placeholder="ACME" value="${escapeHtml(options.organizationCode || "")}" />
      </label>
  ` : "";

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
      <label class="form-field">
        <span>Company Name</span>
        <input name="companyName" type="text" autocomplete="organization" placeholder="Company name" />
      </label>
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
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
        <option value="CHECKED_IN">Checked in</option>
        <option value="CHECKED_OUT">Checked out</option>
        <option value="EXPIRED">Expired</option>
      </select>
      <select data-visitor-size aria-label="Rows per page">
        <option value="10">10 rows</option>
        <option value="20">20 rows</option>
        <option value="50">50 rows</option>
      </select>
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

function renderSkeleton(root) {
  const rows = root.querySelector("[data-visitor-rows]");
  root.querySelector("[data-visitor-empty]")?.classList.add("is-hidden");
  if (!rows) {
    return;
  }
  rows.innerHTML = Array.from({ length: 5 }).map(() => `
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
  `).join("");
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
  rows.innerHTML = state.items.map((visitor) => row(visitor, options)).join("");
}

function row(visitor, options) {
  return `
    <tr>
      <td data-label="Visitor">
        <strong>${escapeHtml(visitor.fullName)}</strong>
        <small>${escapeHtml(visitor.phone)}${visitor.email ? ` · ${escapeHtml(visitor.email)}` : ""}</small>
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
          ${visitor.status === "APPROVED" ? actionButton("check-in", visitor.id, "Check in") : ""}
          ${visitor.status === "CHECKED_IN" ? actionButton("check-out", visitor.id, "Check out") : ""}
          ${options.canDelete ? actionButton("delete", visitor.id, "Delete") : ""}
        </div>
      </td>
    </tr>
  `;
}

function actionButton(action, id, label) {
  const icon = action === "delete"
    ? '<path d="M7 4V2h10v2h4v2H3V4Zm-1 4h12l-1 14H7Z"/>'
    : '<path d="m9 16.2-3.5-3.5L4 14.2 9 19 20 8l-1.5-1.5Z"/>';
  return `
    <button class="icon-button" type="button" title="${label}" data-visitor-action="${action}" data-visitor-id="${escapeHtml(id)}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
    </button>
  `;
}

function renderPagination(root, state, totalItems) {
  const pagination = root.querySelector("[data-visitor-pagination]");
  if (!pagination) {
    return;
  }
  const start = totalItems === 0 ? 0 : state.page * state.size + 1;
  const end = Math.min((state.page + 1) * state.size, totalItems);
  pagination.innerHTML = `
    <span>${start}-${end} of ${totalItems}</span>
    <div>
      <button class="button button--ghost" type="button" data-visitor-action="prev" ${state.page === 0 ? "disabled" : ""}>Previous</button>
      <button class="button button--ghost" type="button" data-visitor-action="next" ${state.page + 1 >= state.totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
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
        ${detail("Organization", visitor.organizationName || visitor.organizationCode || "Unlisted")}
        ${detail("Purpose", visitor.purposeOfVisit)}
        ${detail("Host Employee", visitor.hostEmployee || visitor.hostEmployeeId || "Unassigned")}
        ${detail("Host Department", visitor.hostEmployeeDepartment || "Not recorded")}
        ${detail("Badge ID", visitor.badgeId || "Not issued")}
        ${detail("Scheduled Start", formatDate(visitor.scheduledStartTime))}
        ${detail("Scheduled End", formatDate(visitor.scheduledEndTime))}
        ${detail("Timezone", visitor.scheduledTimezone || "Not scheduled")}
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
  const payload = {
    fullName: trim(data.fullName),
    phone: trim(data.phone),
    email: trim(data.email),
    companyName: trim(data.companyName),
    companyCode: trim(data.companyCode) || options.organizationCode || null,
    purposeOfVisit: trim(data.purposeOfVisit),
  };
  if (options.showHostFields !== false) {
    payload.hostEmployee = trim(data.hostEmployee);
    payload.hostEmployeeId = trim(data.hostEmployeeId);
  }
  return payload;
}

function validate(payload, options, state) {
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
  if (options.requireOrganizationCode && !payload.companyCode) {
    return "Enter the organization code.";
  }
  if (options.showHostFields !== false && !payload.hostEmployee && !payload.hostEmployeeId) {
    return "Select a host employee from the directory.";
  }
  if (!state.photoBlob || !state.photoAccepted) {
    return "Capture the visitor photo.";
  }
  return "";
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

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="status-badge status-badge--${String(status).toLowerCase().replaceAll("_", "-")}">${escapeHtml(label)}</span>`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
