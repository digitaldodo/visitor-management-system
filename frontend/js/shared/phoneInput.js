const COUNTRIES = [
  { name: "India", flag: "🇮🇳", code: "+91", min: 10, max: 10 },
  { name: "United States", flag: "🇺🇸", code: "+1", min: 10, max: 10 },
  { name: "United Kingdom", flag: "🇬🇧", code: "+44", min: 10, max: 10 },
  { name: "Canada", flag: "🇨🇦", code: "+1", min: 10, max: 10 },
  { name: "Australia", flag: "🇦🇺", code: "+61", min: 9, max: 9 },
  { name: "Singapore", flag: "🇸🇬", code: "+65", min: 8, max: 8 },
  { name: "United Arab Emirates", flag: "🇦🇪", code: "+971", min: 9, max: 9 },
  { name: "Germany", flag: "🇩🇪", code: "+49", min: 6, max: 14 },
  { name: "France", flag: "🇫🇷", code: "+33", min: 9, max: 9 },
  { name: "Japan", flag: "🇯🇵", code: "+81", min: 10, max: 10 },
  { name: "Brazil", flag: "🇧🇷", code: "+55", min: 10, max: 11 },
  { name: "China", flag: "🇨🇳", code: "+86", min: 11, max: 11 },
  { name: "Indonesia", flag: "🇮🇩", code: "+62", min: 9, max: 13 },
  { name: "Malaysia", flag: "🇲🇾", code: "+60", min: 8, max: 10 },
  { name: "Mexico", flag: "🇲🇽", code: "+52", min: 10, max: 10 },
  { name: "Netherlands", flag: "🇳🇱", code: "+31", min: 9, max: 9 },
  { name: "New Zealand", flag: "🇳🇿", code: "+64", min: 8, max: 10 },
  { name: "Philippines", flag: "🇵🇭", code: "+63", min: 10, max: 10 },
  { name: "South Africa", flag: "🇿🇦", code: "+27", min: 9, max: 9 },
  { name: "South Korea", flag: "🇰🇷", code: "+82", min: 9, max: 10 },
  { name: "Spain", flag: "🇪🇸", code: "+34", min: 9, max: 9 },
  { name: "Sweden", flag: "🇸🇪", code: "+46", min: 7, max: 13 },
  { name: "Switzerland", flag: "🇨🇭", code: "+41", min: 9, max: 9 },
  { name: "Thailand", flag: "🇹🇭", code: "+66", min: 8, max: 9 },
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
  const control = document.createElement("div");
  control.className = "phone-input-control";
  const select = document.createElement("select");
  select.name = "phoneCountryCode";
  select.setAttribute("aria-label", "Country dialing code");
  select.innerHTML = COUNTRIES.map((country) => `
    <option value="${escapeHtml(country.code)}" ${country.code === selectedCode ? "selected" : ""}>
      ${country.flag} ${escapeHtml(country.code)} ${escapeHtml(country.name)}
    </option>
  `).join("");

  input.dataset.phoneEnhanced = "true";
  input.placeholder = "Mobile number";
  input.autocomplete = "tel-national";
  input.inputMode = "tel";
  input.value = stripDialCode(input.value, selectedCode);
  input.parentElement?.insertBefore(control, input);
  control.append(select, input);

  select.addEventListener("change", () => {
    input.value = stripDialCode(input.value, select.value);
  });
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
