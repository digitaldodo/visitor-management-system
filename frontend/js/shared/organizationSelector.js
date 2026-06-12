import { listOrganizations } from "./organizationApi.js";
import {
  findOrganizationByValue,
  normalizeOrganizationSearch,
  normalizeOrganizations,
  organizationOptionLabel,
  organizationValue,
} from "./organizationHelpers.js";

const MAX_VISIBLE_OPTIONS = 8;
let selectorId = 0;

export function initOrganizationSelectors(root = document, options = {}) {
  const scope = root || document;
  return Array.from(scope.querySelectorAll("[data-organization-selector], [data-organization-select]"))
    .map((element) => initOrganizationSelector(element, options))
    .filter(Boolean);
}

export function initOrganizationSelector(control, options = {}) {
  if (!control || control.dataset.organizationSelectorEnhanced === "true") {
    return null;
  }

  const state = {
    organizations: normalizeOrganizations(options.organizations || []),
    loading: false,
    loaded: Boolean(options.organizations),
    error: "",
    open: false,
    query: "",
    activeIndex: -1,
    selected: null,
  };

  const id = `organization-selector-${++selectorId}`;
  const placeholder = control.dataset.organizationPlaceholder || options.placeholder || "Search organization name or code";
  const label = control.dataset.organizationLabel || options.label || "Organization";
  const wrapper = document.createElement("div");
  wrapper.className = "organization-combobox";
  wrapper.dataset.organizationCombobox = "";
  wrapper.innerHTML = `
    <div class="organization-combobox__control">
      <input class="organization-combobox__input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-listbox" aria-label="${escapeHtml(label)}" autocomplete="off" placeholder="${escapeHtml(placeholder)}" />
      <button class="organization-combobox__clear is-hidden" type="button" aria-label="Clear selected organization">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
      </button>
    </div>
    <div class="organization-combobox__panel is-hidden" id="${id}-listbox" role="listbox" aria-label="${escapeHtml(label)} results"></div>
    <p class="organization-combobox__meta" aria-live="polite"></p>
  `;

  control.dataset.organizationSelectorEnhanced = "true";
  control.classList.add("organization-selector__native");
  control.setAttribute("aria-hidden", "true");
  control.tabIndex = -1;
  control.after(wrapper);

  const input = wrapper.querySelector(".organization-combobox__input");
  const panel = wrapper.querySelector(".organization-combobox__panel");
  const meta = wrapper.querySelector(".organization-combobox__meta");
  const clearButton = wrapper.querySelector(".organization-combobox__clear");

  const syncFromControl = () => {
    const value = control.value || "";
    state.selected = findOrganizationByValue(state.organizations, value, options.valueField);
    input.value = state.selected ? optionLabel(state.selected) : value;
    clearButton.classList.toggle("is-hidden", !value);
  };

  const load = async (force = false) => {
    if (state.loading || (state.loaded && !force)) {
      return;
    }
    state.loading = true;
    state.error = "";
    render();
    try {
      const organizations = typeof options.loadOrganizations === "function"
        ? await options.loadOrganizations({ force })
        : (await listOrganizations({ force }))?.data;
      state.organizations = normalizeOrganizations(organizations);
      state.loaded = true;
      syncFromControl();
    } catch (error) {
      state.error = error?.message || "Organizations could not be loaded.";
    } finally {
      state.loading = false;
      render();
    }
  };

  input.addEventListener("focus", () => {
    open();
    void load(false);
  });

  input.addEventListener("input", () => {
    state.query = input.value;
    state.selected = null;
    setControlValue(control, "");
    state.activeIndex = -1;
    open();
    void load(false);
    render();
  });

  input.addEventListener("keydown", (event) => {
    const optionsList = filteredOrganizations(state);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open();
      state.activeIndex = Math.min(state.activeIndex + 1, Math.min(optionsList.length, MAX_VISIBLE_OPTIONS) - 1);
      render();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.activeIndex = Math.max(state.activeIndex - 1, 0);
      render();
    } else if (event.key === "Enter" && state.open) {
      const organization = optionsList[state.activeIndex];
      if (organization) {
        event.preventDefault();
        selectOrganization(organization);
      }
    } else if (event.key === "Escape") {
      close();
      syncFromControl();
    }
  });

  clearButton.addEventListener("click", () => {
    state.selected = null;
    state.query = "";
    setControlValue(control, "");
    input.value = "";
    input.focus();
    open();
    render();
  });

  panel.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  panel.addEventListener("click", (event) => {
    const option = event.target.closest("[data-organization-option]");
    if (!option) {
      if (event.target.closest("[data-organization-retry]")) {
        void load(true);
      }
      return;
    }
    const organization = state.organizations.find((item) => organizationValue(item, options.valueField) === option.dataset.value);
    if (organization) {
      selectOrganization(organization);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!wrapper.contains(event.target)) {
      close();
      syncFromControl();
    }
  });

  control.form?.addEventListener("reset", () => {
    window.setTimeout(() => {
      state.query = "";
      syncFromControl();
      close();
      render();
    }, 0);
  });

  function open() {
    state.open = true;
    input.setAttribute("aria-expanded", "true");
    render();
  }

  function close() {
    state.open = false;
    input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-expanded", "false");
    panel.classList.add("is-hidden");
  }

  function selectOrganization(organization) {
    state.selected = organization;
    state.query = "";
    input.value = optionLabel(organization);
    setControlValue(control, organizationValue(organization, options.valueField));
    close();
    render();
  }

  function render() {
    clearButton.classList.toggle("is-hidden", !control.value);
    if (!state.open) {
      panel.classList.add("is-hidden");
      meta.textContent = control.value ? "Organization selected." : "";
      return;
    }

    panel.classList.remove("is-hidden");
    if (state.loading) {
      panel.innerHTML = `<div class="organization-combobox__state" role="status">Loading organizations...</div>`;
      meta.textContent = "Loading organizations.";
      positionPanel();
      return;
    }
    if (state.error) {
      panel.innerHTML = `
        <div class="organization-combobox__state">
          <strong>Organizations unavailable</strong>
          <span>${escapeHtml(state.error)}</span>
          <button class="button button--ghost button--small" type="button" data-organization-retry>Retry</button>
        </div>
      `;
      meta.textContent = "Organizations could not be loaded.";
      positionPanel();
      return;
    }

    const matches = filteredOrganizations(state);
    const visible = matches.slice(0, MAX_VISIBLE_OPTIONS);
    if (!state.loaded) {
      panel.innerHTML = `<div class="organization-combobox__state">Focus to load organizations.</div>`;
      meta.textContent = "";
      positionPanel();
      return;
    }
    if (!state.organizations.length) {
      panel.innerHTML = `<div class="organization-combobox__state">No onboarded organizations are available yet.</div>`;
      meta.textContent = "No organizations available.";
      positionPanel();
      return;
    }
    if (!matches.length) {
      panel.innerHTML = `<div class="organization-combobox__state">No organizations match your search.</div>`;
      meta.textContent = "No matching organizations.";
      positionPanel();
      return;
    }

    panel.innerHTML = visible.map((organization, index) => {
      const value = organizationValue(organization, options.valueField);
      const selected = value && value === control.value;
      const active = index === state.activeIndex;
      const optionId = `${id}-option-${index}`;
      return `
        <button class="organization-combobox__option${selected ? " is-selected" : ""}${active ? " is-active" : ""}" id="${optionId}" type="button" role="option" aria-selected="${selected}" data-organization-option data-value="${escapeHtml(value)}">
          <span>
            <strong>${escapeHtml(organization.companyName || organization.name || "Unnamed organization")}</strong>
            <small>${escapeHtml([organization.companyCode || organization.code, organization.regionCountry || organization.timezone].filter(Boolean).join(" · "))}</small>
          </span>
          ${selected ? `<span class="organization-combobox__selected">Selected</span>` : ""}
        </button>
      `;
    }).join("");

    if (state.activeIndex >= 0 && visible[state.activeIndex]) {
      input.setAttribute("aria-activedescendant", `${id}-option-${state.activeIndex}`);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    meta.textContent = matches.length > visible.length
      ? `${visible.length} of ${matches.length} matches shown. Keep typing to narrow results.`
      : `${matches.length} organization${matches.length === 1 ? "" : "s"} available.`;
    positionPanel();
  }

  function positionPanel() {
    window.requestAnimationFrame(() => {
      if (!state.open || panel.classList.contains("is-hidden")) {
        return;
      }
      const controlRect = wrapper.querySelector(".organization-combobox__control").getBoundingClientRect();
      const spaceBelow = Math.max(0, window.innerHeight - controlRect.bottom - 12);
      const spaceAbove = Math.max(0, controlRect.top - 12);
      const idealHeight = Math.min(320, panel.scrollHeight || 320);
      const openAbove = spaceBelow < idealHeight && spaceAbove > spaceBelow;
      const available = openAbove ? spaceAbove : spaceBelow;
      wrapper.classList.toggle("organization-combobox--above", openAbove);
      panel.style.maxHeight = `${Math.max(112, Math.min(320, available || idealHeight))}px`;
    });
  }

  syncFromControl();
  if (options.prefetch || control.dataset.organizationPrefetch === "true") {
    void load(false);
  }

  return {
    refresh: () => load(true),
    sync: syncFromControl,
  };
}

function filteredOrganizations(state) {
    const query = normalizeOrganizationSearch(state.query);
  if (!query) {
    return state.organizations.slice();
  }
  return state.organizations.filter((organization) => {
      const haystack = normalizeOrganizationSearch([
      organization.companyName,
      organization.companyCode,
      organization.regionCountry,
    ].filter(Boolean).join(" "));
    return haystack.includes(query);
  });
}

function optionLabel(organization) {
  return organizationOptionLabel(organization);
}

function setControlValue(control, value) {
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
