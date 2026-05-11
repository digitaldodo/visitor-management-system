import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { getHomepageSettings, updateHomepageSettings } from "../shared/homepageApi.js";
import { createOrganization, listManagedOrganizations, updateOrganization } from "../shared/organizationApi.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { showToast } from "../shared/toast.js";
import { attachFieldValidator, isEmail, validateUsername } from "../shared/validation.js";

let currentSession;
let homepageMetricOptions = [];
let managedOrganizations = [];

document.addEventListener("DOMContentLoaded", async () => {
  initAppErrorBoundary();

  currentSession = requireRole("ADMIN");
  if (!currentSession) {
    return;
  }

  const allowedRoutes = resolveAllowedRoutes();
  initPortalShell(currentSession, { allowedRoutes });
  if (allowedRoutes.includes("visitors")) {
    initVisitorModule("[data-admin-visitors]", {
      basePath: "/admin",
      title: "Full Visitor Access",
      eyebrow: "Visitor Records",
      canDelete: true,
      showOrganizationCodeField: false,
      requireOrganizationCode: false,
      organizationCode: currentSession.organizationCode,
    });
  }
  initAdminUserForm();
  initOrganizationForm();
  initHomepageSettingsForm();
  await loadAdminPortal();
});

async function loadAdminPortal() {
  const canViewReports = hasRole("SUPER_ADMIN");
  const canManageHomepage = hasRole("SUPER_ADMIN");
  const canManageOrganizations = hasRole("SUPER_ADMIN");
  renderDashboardCards([]);
  renderLoadingList("#user-management-list");
  renderLoadingList("#monitoring-list");
  renderEmployeeAnalytics([]);
  if (canViewReports) {
    renderLoadingList("#reports-list");
  }
  if (canManageOrganizations) {
    renderLoadingList("#organizations-list");
  }
  if (canManageHomepage) {
    renderHomepageSettingsState("Loading homepage controls...");
  }

  try {
    const [analytics, users, monitoring, reports, homepageSettings, organizations] = await Promise.all([
      request("/admin/analytics"),
      request("/admin/users"),
      request("/admin/monitoring"),
      canViewReports ? request("/admin/reports") : Promise.resolve({ data: [] }),
      canManageHomepage ? getHomepageSettings() : Promise.resolve({ data: null }),
      canManageOrganizations ? listManagedOrganizations() : Promise.resolve({ data: [] }),
    ]);

    renderAnalytics(analytics.data);
    renderUsers(users.data || []);
    renderMonitoring(monitoring.data);
    if (canViewReports) {
      renderWorkList("#reports-list", reports.data, (report) => workCard(report.title, report.status), "No audit activity yet", "Structured login and access events will appear here.");
    }
    if (canManageHomepage) {
      renderHomepageSettings(homepageSettings.data);
    }
    if (canManageOrganizations) {
      renderOrganizations(organizations.data || []);
    }
  } catch (error) {
    renderAnalytics({});
    renderWorkList("#user-management-list", [], (item) => item, "Admin data unavailable", error.message);
    renderWorkList("#monitoring-list", [], (item) => item, "Monitoring unavailable", error.message);
    if (canViewReports) {
      renderWorkList("#reports-list", [], (item) => item, "Audit oversight unavailable", error.message);
    }
    if (canManageOrganizations) {
      renderWorkList("#organizations-list", [], (item) => item, "Organizations unavailable", error.message);
    }
    if (canManageHomepage) {
      renderHomepageSettingsState(error.message);
    }
    showToast("Admin access blocked", error.message);
  }
}

function initAdminUserForm() {
  const form = document.querySelector("#admin-user-form");
  if (!form) {
    return;
  }

  const roleSelect = form.querySelector("select[name='role']");
  const companyField = form.querySelector("[data-company-code-field]");
  const companyInput = form.querySelector("input[name='companyCode']");
  if (roleSelect && !(currentSession?.roles || []).includes("SUPER_ADMIN")) {
    roleSelect.querySelector("option[value='ADMIN']")?.remove();
  }
  if (companyInput && currentSession?.organizationCode) {
    companyInput.value = currentSession.organizationCode;
  }
  if (companyField && !(currentSession?.roles || []).includes("SUPER_ADMIN")) {
    companyField.classList.add("is-hidden");
  }
  const usernameInput = form.querySelector("input[name='username']");
  const runUsernameValidation = attachFieldValidator(usernameInput, validateUsername);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      fullName: trim(data.fullName),
      username: trim(data.username),
      email: trim(data.email),
      password: data.password,
      role: data.role,
      companyCode: trim(data.companyCode) || currentSession?.organizationCode || null,
      department: trim(data.department),
    };
    const error = validateInternalUser(payload);
    if (error) {
      showToast("Check account", error);
      return;
    }

    setFormLoading(form, true);
    try {
      await request("/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      if (companyInput && currentSession?.organizationCode) {
        companyInput.value = currentSession.organizationCode;
      }
      runUsernameValidation();
      showToast("Account created", "Share the temporary password through your approved internal process.");
      await loadAdminPortal();
    } catch (error) {
      showToast("Account creation failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });

  document.querySelector("#user-management-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-action]");
    if (!button) {
      return;
    }
    const id = button.dataset.userId;
    const action = button.dataset.userAction;
    const roleSelect = button.closest(".admin-user-card")?.querySelector("[data-role-select]");
    const password = action === "reset-password" ? window.prompt("Enter a new temporary password for this account.") : null;
    if (action === "reset-password" && !password) {
      return;
    }
    const requestBody = action === "reset-password"
      ? { newPassword: password }
      : action === "role"
        ? { role: roleSelect?.value }
        : {};

    button.toggleAttribute("disabled", true);
    try {
      await request(`/admin/users/${encodeURIComponent(id)}/${action}`, {
        method: "PATCH",
        body: JSON.stringify(requestBody),
      });
      showToast("Account updated", "User access controls were updated.");
      await loadAdminPortal();
    } catch (error) {
      showToast("Update failed", error.message);
    } finally {
      button.toggleAttribute("disabled", false);
    }
  });
}

function initHomepageSettingsForm() {
  const form = document.querySelector("#homepage-settings-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(currentSession?.roles || []).includes("SUPER_ADMIN")) {
      showToast("Settings locked", "Only SUPER_ADMIN can update homepage controls.");
      return;
    }

    const data = new FormData(form);
    const payload = {
      statsVisible: data.get("statsVisible") === "on",
      publicCountersVisible: data.get("publicCountersVisible") === "on",
      featuredMetricsVisible: data.get("featuredMetricsVisible") === "on",
      announcementVisible: data.get("announcementVisible") === "on",
      announcementTitle: trim(data.get("announcementTitle")),
      announcementBody: trim(data.get("announcementBody")),
      featuredMetricKeys: data.getAll("featuredMetricKeys"),
      publicMetricKeys: data.getAll("publicMetricKeys"),
    };

    setFormLoading(form, true);
    try {
      const response = await updateHomepageSettings(payload);
      renderHomepageSettings(response.data);
      showToast("Homepage updated", "Public homepage controls were saved.");
    } catch (error) {
      showToast("Homepage update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initOrganizationForm() {
  const form = document.querySelector("#organization-form");
  if (!form) {
    return;
  }

  document.querySelector("#organization-form-reset")?.addEventListener("click", () => {
    resetOrganizationForm(form);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasRole("SUPER_ADMIN")) {
      showToast("Organizations locked", "Only SUPER_ADMIN can manage organizations.");
      return;
    }

    const data = new FormData(form);
    const organizationId = trim(data.get("organizationId"));
    const payload = {
      companyName: trim(data.get("companyName")),
      companyCode: String(data.get("companyCode") || "").trim().toUpperCase(),
      contactEmail: trim(data.get("contactEmail")),
      address: trim(data.get("address")),
      activeStatus: data.get("activeStatus") === "on",
    };
    const error = validateOrganization(payload);
    if (error) {
      showToast("Check organization", error);
      return;
    }

    setFormLoading(form, true);
    try {
      if (organizationId) {
        await updateOrganization(organizationId, payload);
        showToast("Organization updated", "Tenant details were saved.");
      } else {
        await createOrganization(payload);
        showToast("Organization created", "Tenant is ready for admin and visitor setup.");
      }
      resetOrganizationForm(form);
      await loadAdminPortal();
    } catch (error) {
      showToast("Organization save failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });

  document.querySelector("#organizations-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-organization-action]");
    if (!button) {
      return;
    }

    const organization = managedOrganizations.find((item) => item.id === button.dataset.organizationId);
    if (!organization) {
      return;
    }

    if (button.dataset.organizationAction === "edit") {
      populateOrganizationForm(form, organization);
      window.location.hash = "organizations";
      return;
    }

    if (button.dataset.organizationAction !== "toggle") {
      return;
    }

    button.toggleAttribute("disabled", true);
    try {
      await updateOrganization(organization.id, {
        companyName: organization.companyName,
        companyCode: organization.companyCode,
        contactEmail: organization.contactEmail || null,
        address: organization.address || null,
        activeStatus: !organization.activeStatus,
      });
      showToast("Organization updated", organization.activeStatus ? "Organization access has been paused." : "Organization is active again.");
      await loadAdminPortal();
    } catch (error) {
      showToast("Organization update failed", error.message);
    } finally {
      button.toggleAttribute("disabled", false);
    }
  });
}

function renderUsers(users) {
  const list = document.querySelector("#user-management-list");
  if (!list) {
    return;
  }

  list.innerHTML = users.length ? users.map(userCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No users found</h3>
      <p>Internal accounts will appear here after administrators create them.</p>
    </article>
  `;
}

function userCard(user) {
  const role = (user.roles || []).join(", ");
  const primaryRole = (user.roles || [])[0] || "";
  const disabled = !user.active || user.accountStatus === "DISABLED";
  const canManageAdmin = !(user.roles || []).includes("ADMIN") || (currentSession?.roles || []).includes("SUPER_ADMIN");
  const canManage = !(user.roles || []).includes("SUPER_ADMIN") && canManageAdmin;
  const roleOptions = internalRoleOptions(primaryRole);
  return `
    <article class="admin-user-card">
      <div class="admin-user-card__header">
        <div>
          <h3>${escapeHtml(user.fullName || user.email || "Unknown user")}</h3>
          <p>${escapeHtml(user.email || "No email")} · ${escapeHtml(user.username || "No username")}</p>
        </div>
        <span class="status-badge status-badge--${disabled ? "rejected" : "approved"}">${disabled ? "Disabled" : "Active"}</span>
      </div>
      <dl>
        <div><dt>Access</dt><dd>${escapeHtml(role)}</dd></div>
        <div><dt>Organization</dt><dd>${escapeHtml(user.organizationName || user.organizationCode || "Platform")}</dd></div>
        <div><dt>Department</dt><dd>${escapeHtml(user.department || "Not set")}</dd></div>
        <div><dt>Account ID</dt><dd>${escapeHtml(user.id || "")}</dd></div>
      </dl>
      <div class="admin-user-card__role">
        <label class="form-field">
          <span>Portal access</span>
          <select data-role-select ${canManage ? "" : "disabled"}>
            ${roleOptions}
          </select>
        </label>
        <button class="button button--ghost" type="button" data-user-action="role" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>Update access</button>
      </div>
      <div class="admin-user-card__actions">
        <button class="button button--ghost" type="button" data-user-action="reset-password" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>Reset password</button>
        <button class="button ${disabled ? "button--primary" : "button--ghost"}" type="button" data-user-action="${disabled ? "enable" : "disable"}" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>${disabled ? "Enable account" : "Disable account"}</button>
      </div>
    </article>
  `;
}

function internalRoleOptions(selectedRole) {
  const roles = [
    ["EMPLOYEE", "Employee portal"],
    ["SECURITY_GUARD", "Security portal"],
  ];
  if ((currentSession?.roles || []).includes("SUPER_ADMIN")) {
    roles.push(["ADMIN", "Administration portal"]);
  }
  if (selectedRole && !roles.some(([role]) => role === selectedRole)) {
    roles.push([selectedRole, formatInternalRole(selectedRole)]);
  }
  return roles.map(([role, label]) => `<option value="${escapeHtml(role)}" ${role === selectedRole ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function formatInternalRole(role) {
  return String(role || "")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderMonitoring(data) {
  renderWorkList("#monitoring-list", Object.entries(data), ([name, status]) => {
    const title = formatMonitoringTitle(name);
    const value = typeof status === "object" && status !== null
      ? Object.entries(status).map(([key, count]) => `${formatMonitoringTitle(key)}: ${count}`).join(" · ")
      : String(status);
    return workCard(title, value);
  }, "No monitoring signals", "System signals will appear after the API responds.");
}

function renderAnalytics(data) {
  renderDashboardCards(data.widgets || []);
  renderChart("#daily-visitors-chart", barChart(data.dailyVisitors || [], "Visitors"));
  renderChart("#monthly-trends-chart", lineChart(data.monthlyTrends || []));
  renderChart("#peak-hours-chart", compactBars(data.peakHours || []));
  renderChart("#approval-rates-chart", approvalRateChart(data.approvalRates || []));
  renderEmployeeAnalytics(data.employeeAnalytics || []);
}

function renderHomepageSettings(data) {
  homepageMetricOptions = Array.isArray(data?.availableMetrics) ? data.availableMetrics : [];
  const settings = data?.settings || {};
  const form = document.querySelector("#homepage-settings-form");
  if (!form) {
    return;
  }

  form.querySelector("input[name='statsVisible']").checked = Boolean(settings.statsVisible);
  form.querySelector("input[name='publicCountersVisible']").checked = Boolean(settings.publicCountersVisible);
  form.querySelector("input[name='featuredMetricsVisible']").checked = Boolean(settings.featuredMetricsVisible);
  form.querySelector("input[name='announcementVisible']").checked = Boolean(settings.announcementVisible);
  form.querySelector("input[name='announcementTitle']").value = settings.announcementTitle || "";
  form.querySelector("textarea[name='announcementBody']").value = settings.announcementBody || "";

  renderMetricOptions("#featured-metrics-options", "featuredMetricKeys", settings.featuredMetricKeys || []);
  renderMetricOptions("#public-counters-options", "publicMetricKeys", settings.publicMetricKeys || []);
  renderHomepagePreview(data?.publicPreview || {});

  const canEdit = (currentSession?.roles || []).includes("SUPER_ADMIN");
  form.querySelectorAll("input, textarea, button[type='submit']").forEach((element) => {
    if (element.type === "submit") {
      element.disabled = !canEdit;
      return;
    }
    element.disabled = !canEdit;
  });

  const meta = document.querySelector("#homepage-settings-meta");
  if (meta) {
    meta.textContent = settings.updatedAt
      ? `Last updated ${new Date(settings.updatedAt).toLocaleString()}${settings.updatedBy ? ` by ${settings.updatedBy}` : ""}.`
      : canEdit
        ? "Homepage controls are ready to configure."
        : "Homepage controls are visible here, but only SUPER_ADMIN can change them.";
  }
}

function resolveAllowedRoutes() {
  return hasRole("SUPER_ADMIN")
    ? ["analytics", "users", "organizations", "homepage-settings", "reports", "monitoring"]
    : ["analytics", "users", "monitoring", "visitors"];
}

function hasRole(role) {
  return (currentSession?.roles || []).includes(role);
}

function renderMetricOptions(selector, name, selectedKeys) {
  const container = document.querySelector(selector);
  if (!container) {
    return;
  }

  const selected = new Set(selectedKeys || []);
  container.innerHTML = homepageMetricOptions.map((metric) => `
    <label class="checkbox-field">
      <input name="${escapeHtml(name)}" type="checkbox" value="${escapeHtml(metric.key)}" ${selected.has(metric.key) ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(metric.label)}</strong>
        <small>${escapeHtml(metric.note)}</small>
      </span>
    </label>
  `).join("");
}

function renderHomepagePreview(preview) {
  const container = document.querySelector("#homepage-settings-preview");
  if (!container) {
    return;
  }

  const announcement = preview?.announcement;
  const featuredMetrics = Array.isArray(preview?.featuredMetrics) ? preview.featuredMetrics : [];
  const publicCounters = Array.isArray(preview?.publicCounters) ? preview.publicCounters : [];

  container.innerHTML = `
    ${announcement?.title && announcement?.body ? `
      <article class="homepage-preview-card homepage-preview-card--announcement">
        <p class="eyebrow">Announcement</p>
        <h3>${escapeHtml(announcement.title)}</h3>
        <p>${escapeHtml(announcement.body)}</p>
      </article>
    ` : ""}
    ${previewMetricsMarkup("Featured metrics", featuredMetrics, preview?.featuredMetricsEmptyState)}
    ${previewMetricsMarkup("Public counters", publicCounters, preview?.publicCountersEmptyState)}
  `;
}

function previewMetricsMarkup(title, items, emptyState) {
  if (!items.length) {
    return `
      <article class="homepage-preview-card">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(emptyState?.message || "No public metrics are currently available.")}</p>
      </article>
    `;
  }

  return `
    <article class="homepage-preview-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="homepage-preview-metrics">
        ${items.map((metric) => `
          <div>
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderHomepageSettingsState(message) {
  const preview = document.querySelector("#homepage-settings-preview");
  if (preview) {
    preview.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>Homepage controls unavailable</h3>
        <p>${escapeHtml(message || "Homepage controls could not be loaded.")}</p>
      </article>
    `;
  }
}

function renderOrganizations(items) {
  managedOrganizations = Array.isArray(items) ? items : [];
  const list = document.querySelector("#organizations-list");
  if (!list) {
    return;
  }

  list.innerHTML = managedOrganizations.length ? managedOrganizations.map(organizationCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No organizations yet</h3>
      <p>Create the first tenant to start assigning admins and visitor workflows.</p>
    </article>
  `;
}

function organizationCard(organization) {
  return `
    <article class="organization-card">
      <div class="organization-card__header">
        <div>
          <h3>${escapeHtml(organization.companyName)}</h3>
          <p>${escapeHtml(organization.companyCode)} · ${escapeHtml(organization.contactEmail || "No contact email")}</p>
        </div>
        <span class="status-badge status-badge--${organization.activeStatus ? "approved" : "rejected"}">${organization.activeStatus ? "Active" : "Inactive"}</span>
      </div>
      <dl>
        <div><dt>Address</dt><dd>${escapeHtml(organization.address || "No address recorded")}</dd></div>
        <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(organization.createdAt))}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(formatDateTime(organization.updatedAt))}</dd></div>
      </dl>
      <div class="organization-card__actions">
        <button class="button button--ghost" type="button" data-organization-action="edit" data-organization-id="${escapeHtml(organization.id)}">Edit</button>
        <button class="button ${organization.activeStatus ? "button--ghost" : "button--primary"}" type="button" data-organization-action="toggle" data-organization-id="${escapeHtml(organization.id)}">${organization.activeStatus ? "Deactivate" : "Activate"}</button>
      </div>
    </article>
  `;
}

function renderDashboardCards(widgets) {
  const grid = document.querySelector("#metric-grid");
  if (!grid) {
    return;
  }

  if (!widgets.length) {
    grid.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>No analytics yet</h3>
        <p>Visitor metrics will appear after activity starts.</p>
      </article>
    `;
    return;
  }

  const icons = ["M4 19h16v2H4Zm2-8h3v6H6Zm5-6h3v12h-3Zm5 3h3v9h-3Z", "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0Z", "m9 16.2-3.5-3.5L4 14.2 9 19 20 8l-1.5-1.5Z", "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h5v-2h-4V6h-2Z", "M12 2 2 20h20Zm0 6 5.2 10H6.8Z"];
  grid.innerHTML = widgets.map((metric, index) => `
    <article class="admin-metric-card">
      <span class="admin-metric-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${icons[index] || icons[0]}"/></svg></span>
      <span class="metric-card__label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </article>
  `).join("");
}

function renderChart(selector, markup) {
  const element = document.querySelector(selector);
  if (element) {
    element.innerHTML = markup;
  }
}

function barChart(data, suffix) {
  if (!data.length) {
    return chartEmpty("No daily visitor data yet.");
  }
  const max = maxValue(data);
  const bars = data.map((item, index) => {
    const height = Math.max(4, Math.round((Number(item.value) / max) * 150));
    const x = 22 + index * 38;
    const y = 174 - height;
    return `
      <rect x="${x}" y="${y}" width="22" height="${height}" rx="5"></rect>
      <text x="${x + 11}" y="198" text-anchor="middle">${escapeHtml(item.label)}</text>
      <title>${escapeHtml(item.label)}: ${escapeHtml(item.value)} ${escapeHtml(suffix)}</title>
    `;
  }).join("");
  return `<svg class="chart-svg bar-chart" viewBox="0 0 560 220" role="img" aria-label="${escapeHtml(suffix)} bar chart">${bars}</svg>`;
}

function lineChart(data) {
  if (!data.length) {
    return chartEmpty("No monthly trend data yet.");
  }
  const max = maxValue(data);
  const points = data.map((item, index) => {
    const x = 22 + index * 46;
    const y = 174 - Math.round((Number(item.value) / max) * 145);
    return `${x},${y}`;
  }).join(" ");
  const dots = data.map((item, index) => {
    const [x, y] = points.split(" ")[index].split(",");
    return `<circle cx="${x}" cy="${y}" r="5"><title>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</title></circle>`;
  }).join("");
  const labels = data.map((item, index) => `<text x="${22 + index * 46}" y="198" text-anchor="middle">${escapeHtml(item.label)}</text>`).join("");
  return `<svg class="chart-svg line-chart" viewBox="0 0 560 220" role="img" aria-label="Monthly visitor trend"><polyline points="${points}"></polyline>${dots}${labels}</svg>`;
}

function compactBars(data) {
  const filtered = data.filter((_, index) => index % 2 === 0);
  if (!filtered.length) {
    return chartEmpty("No peak-hour activity yet.");
  }
  const max = maxValue(filtered);
  return `
    <div class="hour-chart">
      ${filtered.map((item) => `
        <div class="hour-chart__row">
          <span>${escapeHtml(item.label)}</span>
          <div><i style="width: ${Math.max(4, Math.round((Number(item.value) / max) * 100))}%"></i></div>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function approvalRateChart(data) {
  if (!data.length) {
    return chartEmpty("No approval decisions yet.");
  }
  return `
    <div class="approval-rate-chart">
      ${data.map((item) => `
        <article>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.percentage)}%</strong>
          <div><i style="width: ${Math.max(2, Number(item.percentage))}%"></i></div>
          <small>${escapeHtml(item.value)} visitors</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderEmployeeAnalytics(items) {
  const table = document.querySelector("#employee-analytics-table");
  if (!table) {
    return;
  }

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Total</th>
          <th>Active</th>
          <th>Pending</th>
          <th>Rejected</th>
        </tr>
      </thead>
      <tbody>
        ${items.length ? items.map((item) => `
          <tr>
            <td data-label="Employee"><strong>${escapeHtml(item.employee)}</strong></td>
            <td data-label="Total">${escapeHtml(item.total)}</td>
            <td data-label="Active">${escapeHtml(item.active)}</td>
            <td data-label="Pending">${escapeHtml(item.pending)}</td>
            <td data-label="Rejected">${escapeHtml(item.rejected)}</td>
          </tr>
        `).join("") : `<tr><td colspan="5"><div class="empty-state empty-state--inline"><h3>No employee activity</h3><p>Host-level analytics will appear after visitor records are created.</p></div></td></tr>`}
      </tbody>
    </table>
  `;
}

function populateOrganizationForm(form, organization) {
  form.querySelector("input[name='organizationId']").value = organization.id || "";
  form.querySelector("input[name='companyName']").value = organization.companyName || "";
  form.querySelector("input[name='companyCode']").value = organization.companyCode || "";
  form.querySelector("input[name='contactEmail']").value = organization.contactEmail || "";
  form.querySelector("input[name='address']").value = organization.address || "";
  form.querySelector("input[name='activeStatus']").checked = Boolean(organization.activeStatus);
  const meta = document.querySelector("#organization-form-meta");
  if (meta) {
    meta.textContent = `Editing ${organization.companyName}. Save to update this tenant.`;
  }
}

function resetOrganizationForm(form) {
  form.reset();
  form.querySelector("input[name='organizationId']").value = "";
  form.querySelector("input[name='activeStatus']").checked = true;
  const meta = document.querySelector("#organization-form-meta");
  if (meta) {
    meta.textContent = "Create organizations for tenant onboarding and admin assignment.";
  }
}

function maxValue(data) {
  return Math.max(1, ...data.map((item) => Number(item.value) || 0));
}

function chartEmpty(message) {
  return `<div class="empty-state empty-state--inline"><h3>No chart data</h3><p>${escapeHtml(message)}</p></div>`;
}

function validateOrganization(payload) {
  if (!payload.companyName || payload.companyName.length < 2) {
    return "Enter the organization name.";
  }
  if (!/^[A-Z0-9_-]{2,24}$/.test(payload.companyCode || "")) {
    return "Use a 2-24 character organization code with letters, numbers, hyphens, or underscores.";
  }
  if (payload.contactEmail && !isEmail(payload.contactEmail)) {
    return "Use a valid contact email.";
  }
  return "";
}

function validateInternalUser(payload) {
  if (!payload.fullName || payload.fullName.length < 2) {
    return "Enter the person's full name.";
  }
  const usernameError = validateUsername(payload.username);
  if (usernameError) {
    return usernameError;
  }
  if (!isEmail(payload.email || "")) {
    return "Use a valid work email.";
  }
  if (!["EMPLOYEE", "SECURITY_GUARD", "ADMIN"].includes(payload.role)) {
    return "Choose an internal access type.";
  }
  if ((currentSession?.roles || []).includes("SUPER_ADMIN") && !payload.companyCode) {
    return "Enter the organization code for this account.";
  }
  if (!/[a-z]/.test(payload.password || "")
      || !/[A-Z]/.test(payload.password || "")
      || !/\d/.test(payload.password || "")
      || !/[^A-Za-z0-9]/.test(payload.password || "")
      || String(payload.password || "").length < 12) {
    return "Temporary password must be 12+ characters with uppercase, lowercase, number, and symbol.";
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

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function formatMonitoringTitle(value) {
  return String(value || "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll(/\b\w/g, (char) => char.toUpperCase());
}
