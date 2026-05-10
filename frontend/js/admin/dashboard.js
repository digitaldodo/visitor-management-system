import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["analytics", "users", "reports", "monitoring", "visitors"];

document.addEventListener("DOMContentLoaded", async () => {
  const session = requireRole("ADMIN");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  initVisitorModule("[data-admin-visitors]", {
    basePath: "/admin",
    title: "Full Visitor Access",
    eyebrow: "Visitor Records",
    canDelete: true,
  });
  await loadAdminPortal();
});

async function loadAdminPortal() {
  try {
    const [analytics, users, reports, monitoring] = await Promise.all([
      request("/admin/analytics"),
      request("/admin/users"),
      request("/admin/reports"),
      request("/admin/monitoring"),
    ]);

    renderAnalytics(analytics.data);
    renderWorkList("#user-management-list", users.data, (user) => workCard(user.name, user.role, user.status));
    renderWorkList("#reports-list", reports.data, (report) => workCard(report.title, report.status));
    renderMonitoring(monitoring.data);
  } catch (error) {
    showToast("Admin access blocked", error.message);
  }
}

function renderMonitoring(data) {
  renderWorkList("#monitoring-list", Object.entries(data), ([name, status]) => {
    const value = typeof status === "object" ? Object.entries(status).map(([key, count]) => `${key}: ${count}`).join(", ") : status;
    return workCard(name, value);
  });
}

function renderAnalytics(data) {
  renderDashboardCards(data.widgets || []);
  renderChart("#daily-visitors-chart", barChart(data.dailyVisitors || [], "Visitors"));
  renderChart("#monthly-trends-chart", lineChart(data.monthlyTrends || []));
  renderChart("#peak-hours-chart", compactBars(data.peakHours || []));
  renderChart("#approval-rates-chart", approvalRateChart(data.approvalRates || []));
  renderEmployeeAnalytics(data.employeeAnalytics || []);
}

function renderDashboardCards(widgets) {
  const grid = document.querySelector("#metric-grid");
  if (!grid) {
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
        `).join("") : `<tr><td colspan="5">No employee visitor activity yet.</td></tr>`}
      </tbody>
    </table>
  `;
}

function maxValue(data) {
  return Math.max(1, ...data.map((item) => Number(item.value) || 0));
}
