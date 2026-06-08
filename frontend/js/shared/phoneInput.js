const COUNTRIES = [
  { name: "India", iso2: "IN", flag: "🇮🇳", code: "+91", min: 10, max: 10, example: "98765 43210" },
  { name: "United States", iso2: "US", flag: "🇺🇸", code: "+1", min: 10, max: 10, example: "(555) 123-4567" },
  { name: "United Kingdom", iso2: "GB", flag: "🇬🇧", code: "+44", min: 10, max: 10, example: "7400 123456" },
  { name: "Canada", iso2: "CA", flag: "🇨🇦", code: "+1", min: 10, max: 10, example: "(416) 555-0100" },
  { name: "Australia", iso2: "AU", flag: "🇦🇺", code: "+61", min: 9, max: 9, example: "412 345 678" },
  { name: "Singapore", iso2: "SG", flag: "🇸🇬", code: "+65", min: 8, max: 8, example: "8123 4567" },
  { name: "United Arab Emirates", iso2: "AE", flag: "🇦🇪", code: "+971", min: 9, max: 9, example: "50 123 4567" },
  { name: "Germany", iso2: "DE", flag: "🇩🇪", code: "+49", min: 6, max: 14, example: "1512 3456789" },
  { name: "France", iso2: "FR", flag: "🇫🇷", code: "+33", min: 9, max: 9, example: "6 12 34 56 78" },
  { name: "Japan", iso2: "JP", flag: "🇯🇵", code: "+81", min: 10, max: 10, example: "90 1234 5678" },
  { name: "Brazil", iso2: "BR", flag: "🇧🇷", code: "+55", min: 10, max: 11, example: "11 91234 5678" },
  { name: "China", iso2: "CN", flag: "🇨🇳", code: "+86", min: 11, max: 11, example: "138 0013 8000" },
  { name: "Indonesia", iso2: "ID", flag: "🇮🇩", code: "+62", min: 9, max: 13, example: "812 3456 7890" },
  { name: "Malaysia", iso2: "MY", flag: "🇲🇾", code: "+60", min: 8, max: 10, example: "12 345 6789" },
  { name: "Mexico", iso2: "MX", flag: "🇲🇽", code: "+52", min: 10, max: 10, example: "55 1234 5678" },
  { name: "Netherlands", iso2: "NL", flag: "🇳🇱", code: "+31", min: 9, max: 9, example: "6 12345678" },
  { name: "New Zealand", iso2: "NZ", flag: "🇳🇿", code: "+64", min: 8, max: 10, example: "21 123 4567" },
  { name: "Philippines", iso2: "PH", flag: "🇵🇭", code: "+63", min: 10, max: 10, example: "917 123 4567" },
  { name: "South Africa", iso2: "ZA", flag: "🇿🇦", code: "+27", min: 9, max: 9, example: "71 123 4567" },
  { name: "South Korea", iso2: "KR", flag: "🇰🇷", code: "+82", min: 9, max: 10, example: "10 1234 5678" },
  { name: "Spain", iso2: "ES", flag: "🇪🇸", code: "+34", min: 9, max: 9, example: "612 34 56 78" },
  { name: "Sweden", iso2: "SE", flag: "🇸🇪", code: "+46", min: 7, max: 13, example: "70 123 45 67" },
  { name: "Switzerland", iso2: "CH", flag: "🇨🇭", code: "+41", min: 9, max: 9, example: "76 123 45 67" },
  { name: "Thailand", iso2: "TH", flag: "🇹🇭", code: "+66", min: 8, max: 9, example: "81 234 5678" },
];

export function initPhoneInput(form, options = {}) {
  const input = form?.querySelector("input[name='phone']");
  if (!input || input.dataset.phoneEnhanced === "true") {
    return;
  }

  const field = input.closest(".form-field") || input.parentElement;
  if (!field) {
    return;
  }

  const selectedCode = normalizeDialCode(options.defaultCountryCode || inferDialCode(input.value) || "+91");
  const selectedCountry = countryForCode(selectedCode) || COUNTRIES[0];
  const control = document.createElement("div");
  control.className = "phone-input-control";
  control.dataset.phoneControl = "true";
  const searchId = `phone-country-search-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  control.innerHTML = `
    <input type="hidden" name="phoneCountryCode" value="${escapeHtml(selectedCountry.code)}" data-phone-country-code />
    <div class="phone-country" data-phone-country>
      <button class="phone-country__button" type="button" aria-haspopup="listbox" aria-expanded="false" data-phone-country-button>
        <span class="phone-country__flag" data-phone-country-flag>${selectedCountry.flag}</span>
        <span class="phone-country__code" data-phone-country-label>${escapeHtml(selectedCountry.code)}</span>
        <span class="phone-country__chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="phone-country__menu is-hidden" data-phone-country-menu>
        <label class="sr-only" for="${searchId}">Search country code</label>
        <input class="phone-country__search" id="${searchId}" type="search" autocomplete="off" placeholder="Search country" data-phone-country-search />
        <div class="phone-country__results" role="listbox" data-phone-country-results></div>
      </div>
    </div>
    <div class="phone-number" data-phone-number></div>
  `;

  input.dataset.phoneEnhanced = "true";
  input.placeholder = selectedCountry.example;
  input.autocomplete = "tel-national";
  input.inputMode = "tel";
  input.value = formatNationalNumber(stripDialCode(input.value, selectedCountry.code), selectedCountry);
  input.parentElement?.insertBefore(control, input);
  control.querySelector("[data-phone-number]")?.append(input);

  bindPhoneControl(control, input);
  updateCountryResults(control, "");
}

export function setPhoneInputValues(form, profile = {}) {
  const input = form?.querySelector("input[name='phone']");
  const control = input?.closest("[data-phone-control]");
  const country = countryForCode(profile.phoneCountryCode) || countryForCode(inferDialCode(profile.phone)) || COUNTRIES[0];
  if (control) {
    selectCountry(control, country);
  } else {
    const codeField = form?.querySelector("[name='phoneCountryCode']");
    if (codeField) {
      codeField.value = country.code;
    }
  }
  if (input) {
    input.value = formatNationalNumber(stripDialCode(profile.phone, country.code), country);
  }
}

export function phonePayload(data) {
  return {
    phoneCountryCode: normalizeDialCode(data.phoneCountryCode || "+91"),
    phone: normalizeNationalNumber(data.phone),
  };
}

export function validatePhonePayload(payload, options = {}) {
  const { required = true } = options;
  const phone = normalizeNationalNumber(payload.phone);
  if (!phone) {
    return required ? "Enter a reachable mobile number." : "";
  }
  const country = countryForCode(payload.phoneCountryCode);
  const digits = phone.replace(/\D/g, "");
  if (!country || digits.length < country.min || digits.length > country.max) {
    return "Enter a valid mobile number for the selected country.";
  }
  return "";
}

function countryForCode(code) {
  const normalized = normalizeDialCode(code);
  return COUNTRIES.find((country) => country.code === normalized) || null;
}

function inferDialCode(value) {
  const text = String(value || "").trim();
  return COUNTRIES
    .map((country) => country.code)
    .sort((left, right) => right.length - left.length)
    .find((code) => text.startsWith(code));
}

function stripDialCode(value, code) {
  const text = String(value || "").trim();
  const dialCode = normalizeDialCode(code);
  return text.startsWith(dialCode) ? text.slice(dialCode.length).trim() : text;
}

function normalizeNationalNumber(value) {
  return String(value || "")
    .trim()
    .replaceAll(/[^\d\s().-]/g, "")
    .replaceAll(/\s+/g, " ");
}

function normalizeDialCode(value) {
  const text = String(value || "").trim();
  return text.startsWith("+") ? text : `+${text}`;
}

function bindPhoneControl(control, input) {
  const countryButton = control.querySelector("[data-phone-country-button]");
  const countryMenu = control.querySelector("[data-phone-country-menu]");
  const countrySearch = control.querySelector("[data-phone-country-search]");
  const countryResults = control.querySelector("[data-phone-country-results]");

  countryButton?.addEventListener("click", () => {
    const isOpen = !countryMenu?.classList.contains("is-hidden");
    toggleCountryMenu(control, !isOpen);
  });

  countrySearch?.addEventListener("input", () => {
    updateCountryResults(control, countrySearch.value);
  });

  countryResults?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-phone-country-option]");
    if (!option) {
      return;
    }
    const country = COUNTRIES.find((item) => item.iso2 === option.dataset.countryIso && item.code === option.dataset.countryCode);
    if (country) {
      selectCountry(control, country);
      input.value = formatNationalNumber(input.value, country);
      toggleCountryMenu(control, false);
      input.focus();
    }
  });

  input.addEventListener("input", () => {
    input.value = formatNationalNumber(input.value, currentCountry(control));
  });

  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text") || "";
    const inferred = countryForCode(inferDialCode(text));
    const country = inferred || currentCountry(control);
    if (inferred) {
      selectCountry(control, inferred);
    }
    input.value = formatNationalNumber(stripDialCode(text, country.code), country);
  });

  document.addEventListener("click", (event) => {
    if (!control.contains(event.target)) {
      toggleCountryMenu(control, false);
    }
  });

  control.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleCountryMenu(control, false);
      countryButton?.focus();
    }
  });
}

function toggleCountryMenu(control, open) {
  const menu = control.querySelector("[data-phone-country-menu]");
  const button = control.querySelector("[data-phone-country-button]");
  menu?.classList.toggle("is-hidden", !open);
  button?.setAttribute("aria-expanded", String(open));
  if (open) {
    const search = control.querySelector("[data-phone-country-search]");
    updateCountryResults(control, "");
    window.setTimeout(() => search?.focus(), 0);
  }
}

function updateCountryResults(control, query) {
  const results = control.querySelector("[data-phone-country-results]");
  if (!results) {
    return;
  }
  const normalized = String(query || "").trim().toLowerCase();
  const countries = COUNTRIES.filter((country) => [
    country.name,
    country.iso2,
    country.code,
  ].join(" ").toLowerCase().includes(normalized)).slice(0, normalized ? 10 : 8);
  results.innerHTML = countries.map((country) => `
    <button class="phone-country__option" type="button" role="option" data-phone-country-option data-country-iso="${escapeHtml(country.iso2)}" data-country-code="${escapeHtml(country.code)}">
      <span class="phone-country__option-main"><span aria-hidden="true">${country.flag}</span><strong>${escapeHtml(country.name)}</strong></span>
      <span class="phone-country__option-meta">${escapeHtml(country.code)} · ${escapeHtml(country.example)}</span>
    </button>
  `).join("") || `<p class="phone-country__empty">No countries found</p>`;
}

function selectCountry(control, country) {
  const hidden = control.querySelector("[data-phone-country-code]");
  const flag = control.querySelector("[data-phone-country-flag]");
  const label = control.querySelector("[data-phone-country-label]");
  const input = control.querySelector("input[name='phone']");
  if (hidden) {
    hidden.value = country.code;
  }
  if (flag) {
    flag.textContent = country.flag;
  }
  if (label) {
    label.textContent = country.code;
  }
  if (input) {
    input.placeholder = country.example;
  }
}

function currentCountry(control) {
  return countryForCode(control.querySelector("[data-phone-country-code]")?.value) || COUNTRIES[0];
}

function formatNationalNumber(value, country) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 15);
  if (!digits) {
    return "";
  }
  if (["US", "CA"].includes(country.iso2)) {
    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  if (country.iso2 === "IN") {
    return [digits.slice(0, 5), digits.slice(5, 10)].filter(Boolean).join(" ");
  }
  if (["AE", "SA", "PH", "ZA"].includes(country.iso2)) {
    return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9), digits.slice(9, 12)].filter(Boolean).join(" ");
  }
  if (["SG", "QA", "OM", "KW", "BH"].includes(country.iso2)) {
    return [digits.slice(0, 4), digits.slice(4, 8)].filter(Boolean).join(" ");
  }
  return digits.match(/.{1,3}/g)?.join(" ") || digits;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
