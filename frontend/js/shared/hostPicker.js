import { searchEmployeeDirectory } from "./employeeDirectoryApi.js";

export function initHostPicker(root, options = {}) {
  if (!root) {
    return;
  }
  const input = root.querySelector(options.inputSelector || "[data-host-search-input]");
  const hiddenId = root.querySelector(options.idSelector || "[data-host-id]");
  const hiddenName = root.querySelector(options.nameSelector || "[data-host-name]");
  const meta = root.querySelector(options.metaSelector || "[data-host-meta]");
  const results = root.querySelector(options.resultsSelector || "[data-host-results]");
  const companyCodeField = root.querySelector(options.companyCodeSelector || "[name='companyCode']");
  if (!input || !hiddenId || !hiddenName || !results) {
    return;
  }

  let requestToken = 0;

  const updateMeta = (message = "") => {
    if (meta) {
      meta.textContent = message;
    }
  };

  const clearSelection = () => {
    hiddenId.value = "";
    hiddenName.value = "";
    input.dataset.hostValidated = "false";
  };

  const renderResults = (items = [], emptyMessage = "No matching employees") => {
    if (!items.length) {
      results.innerHTML = `<button class="host-picker__option is-empty" type="button" disabled>${emptyMessage}</button>`;
      results.classList.remove("is-hidden");
      return;
    }
    results.innerHTML = items.map((employee) => `
      <button
        class="host-picker__option"
        type="button"
        data-host-option
        data-host-id="${escapeHtml(employee.id)}"
        data-host-name="${escapeHtml(employee.fullName)}"
        data-host-department="${escapeHtml(employee.department || "")}"
        data-host-email="${escapeHtml(employee.email || "")}"
      >
        <strong>${escapeHtml(employee.fullName)}</strong>
        <span>${escapeHtml(employee.department || employee.email || "Employee")}</span>
      </button>
    `).join("");
    results.classList.remove("is-hidden");
  };

  const search = debounce(async () => {
    const companyCode = companyCodeField?.value?.trim();
    const query = input.value.trim();
    clearSelection();
    if (query.length < 2) {
      results.classList.add("is-hidden");
      updateMeta(companyCodeField && !companyCode ? "Choose an organization first." : "Search by employee name, email, or username.");
      return;
    }
    if (companyCodeField && !companyCode) {
      renderResults([], "Select an organization before searching.");
      updateMeta("Choose an organization first.");
      return;
    }

    const nextToken = ++requestToken;
    updateMeta("Searching employee directory...");
    try {
      const response = await searchEmployeeDirectory(options.basePath, { query, companyCode });
      if (nextToken !== requestToken) {
        return;
      }
      renderResults(response.data || []);
      updateMeta("Select the correct host to lock the request.");
    } catch (error) {
      renderResults([], "Employee search unavailable");
      updateMeta(error.message);
    }
  }, 220);

  input.addEventListener("input", search);
  input.addEventListener("focus", search);
  companyCodeField?.addEventListener("change", () => {
    clearSelection();
    input.value = "";
    results.classList.add("is-hidden");
    updateMeta("Search by employee name, email, or username.");
  });

  results.addEventListener("click", (event) => {
    const option = event.target.closest("[data-host-option]");
    if (!option) {
      return;
    }
    hiddenId.value = option.dataset.hostId || "";
    hiddenName.value = option.dataset.hostName || "";
    input.value = option.dataset.hostName || "";
    input.dataset.hostValidated = hiddenId.value ? "true" : "false";
    updateMeta(option.dataset.hostDepartment || option.dataset.hostEmail || "Host selected.");
    results.classList.add("is-hidden");
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) {
      results.classList.add("is-hidden");
    }
  });

  updateMeta("Search by employee name, email, or username.");
}

function debounce(callback, delay) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
