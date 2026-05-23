const LANGUAGE_KEY = "accessflow.web.language.v1";
const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = new Set(["en", "hi"]);

const translations = Object.freeze({
  hi: Object.freeze({
    "Access control": "एक्सेस नियंत्रण",
    "AccessFlow operations": "AccessFlow संचालन",
    "AccessFlow enterprise control plane": "AccessFlow एंटरप्राइज कंट्रोल प्लेन",
    "AccessFlow operations console": "AccessFlow संचालन कंसोल",
    "AccessFlow visitor portal": "AccessFlow आगंतुक पोर्टल",
    "AccessFlow workflow hub": "AccessFlow वर्कफ़्लो हब",
    "Active": "सक्रिय",
    "Active access": "सक्रिय एक्सेस",
    "Active passes": "सक्रिय पास",
    "Administration": "प्रशासन",
    "Administration Portal": "प्रशासन पोर्टल",
    "Admin approval required": "एडमिन स्वीकृति आवश्यक",
    "Admin-Controlled": "एडमिन-नियंत्रित",
    "Alert Center": "अलर्ट केंद्र",
    "All": "सभी",
    "API checking": "API जांच जारी",
    "API offline": "API ऑफलाइन",
    "API online": "API ऑनलाइन",
    "Approval Queue": "स्वीकृति कतार",
    "Approval routing": "स्वीकृति रूटिंग",
    "Approval status": "स्वीकृति स्थिति",
    "Approve": "स्वीकृत करें",
    "Approved": "स्वीकृत",
    "Approved access badge": "स्वीकृत एक्सेस बैज",
    "Audit": "ऑडिट",
    "Audit history": "ऑडिट इतिहास",
    "Audit oversight": "ऑडिट निगरानी",
    "Audit Trail": "ऑडिट ट्रेल",
    "Badge": "बैज",
    "Badge and QR": "बैज और QR",
    "Badge downloaded": "बैज डाउनलोड हुआ",
    "Badge ID": "बैज ID",
    "Badge ready. Present it at the security checkpoint.": "बैज तैयार है। इसे सुरक्षा चेकपॉइंट पर दिखाएं।",
    "Cancel": "रद्द करें",
    "Check details": "विवरण जांचें",
    "Check-in / Check-out": "चेक-इन / चेक-आउट",
    "Checked in": "चेक-इन",
    "Checked out": "चेक-आउट",
    "Close": "बंद करें",
    "Confirm": "पुष्टि करें",
    "Confirm action": "कार्रवाई पुष्टि करें",
    "Correction details": "सुधार विवरण",
    "Current badge": "वर्तमान बैज",
    "Dashboard": "डैशबोर्ड",
    "Denied": "अस्वीकृत",
    "Denied Entry Report": "अस्वीकृत प्रवेश रिपोर्ट",
    "Department": "विभाग",
    "Download CSV": "CSV डाउनलोड करें",
    "Download PDF": "PDF डाउनलोड करें",
    "Download report": "रिपोर्ट डाउनलोड करें",
    "Deny workforce onboarding": "कार्यबल ऑनबोर्डिंग अस्वीकृत करें",
    "Emergency": "आपातकाल",
    "Emergency Ops": "आपात संचालन",
    "Emergency operations": "आपात संचालन",
    "Employee Dashboard": "कर्मचारी डैशबोर्ड",
    "English": "अंग्रेजी",
    "Enter details": "विवरण दर्ज करें",
    "Export CSV": "CSV एक्सपोर्ट करें",
    "Export PDF": "PDF एक्सपोर्ट करें",
    "Export PNG": "PNG एक्सपोर्ट करें",
    "Export report": "रिपोर्ट एक्सपोर्ट करें",
    "Exports": "एक्सपोर्ट",
    "History": "इतिहास",
    "Hindi": "हिंदी",
    "Invites": "आमंत्रण",
    "Live register": "लाइव रजिस्टर",
    "Logout": "लॉग आउट",
    "Mark all read": "सभी पढ़ा हुआ करें",
    "Monitoring": "मॉनिटरिंग",
    "My Visits": "मेरी विजिट",
    "No audit activity yet": "अभी कोई ऑडिट गतिविधि नहीं",
    "No export snapshots": "अभी कोई एक्सपोर्ट स्नैपशॉट नहीं",
    "No metrics yet": "अभी कोई मीट्रिक नहीं",
    "No notifications": "कोई सूचना नहीं",
    "Operational Audit Log": "संचालन ऑडिट लॉग",
    "Operational exports": "संचालन एक्सपोर्ट",
    "Operational report": "संचालन रिपोर्ट",
    "Operational Summary": "संचालन सारांश",
    "Request onboarding changes": "ऑनबोर्डिंग बदलाव मांगें",
    "Reset temporary password": "अस्थायी पासवर्ड रीसेट करें",
    "Pending": "लंबित",
    "Pending approval": "स्वीकृति लंबित",
    "Presence": "उपस्थिति",
    "QR Verification": "QR सत्यापन",
    "Reason": "कारण",
    "Refresh": "रिफ्रेश",
    "Register visitor": "आगंतुक रजिस्टर करें",
    "Reports": "रिपोर्ट",
    "Request Visit": "विजिट अनुरोध",
    "Requests": "अनुरोध",
    "Revoked": "रद्द",
    "Save": "सेव करें",
    "Security Incident Report": "सुरक्षा घटना रिपोर्ट",
    "Security workspace": "सुरक्षा कार्यक्षेत्र",
    "Share export": "एक्सपोर्ट शेयर करें",
    "Signed in": "साइन इन",
    "Status": "स्थिति",
    "Submitted": "जमा",
    "Suspended": "निलंबित",
    "Visitor access made simple and secure.": "आगंतुक एक्सेस सरल और सुरक्षित।",
    "Visitor operations": "आगंतुक संचालन",
    "Visitor Register": "आगंतुक रजिस्टर",
    "Visits": "विजिट",
    "Workforce Activity Report": "कार्यबल गतिविधि रिपोर्ट",
    "Workforce Check-In": "कार्यबल चेक-इन",
    "Workforce Logs": "कार्यबल लॉग",
    "Workforce Onboarding": "कार्यबल ऑनबोर्डिंग",
    "Workforce operations": "कार्यबल संचालन",
    "Workforce Presence": "कार्यबल उपस्थिति",
    "Workspace": "कार्यस्थल",
    "Workspace language": "कार्यस्थल भाषा",
  }),
});

let currentLanguage = readLanguage();
let observer = null;

export function initWebLocalization() {
  document.documentElement.lang = currentLanguage;
  installLanguageControl();
  translateDocument();
  observeTranslations();
}

export function t(value, params = {}) {
  const source = String(value ?? "");
  const translated = currentLanguage === "hi" ? translations.hi[source] || source : source;
  return interpolate(translated, params);
}

export function localizedHtml(value, params = {}) {
  return escapeHtml(t(value, params));
}

export function getWebLanguage() {
  return currentLanguage;
}

export function setWebLanguage(language) {
  const normalized = SUPPORTED_LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
  currentLanguage = normalized;
  document.documentElement.lang = normalized;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, normalized);
  } catch {
    // Language selection remains in-memory when storage is unavailable.
  }
  translateDocument();
}

export function translateFragment(root) {
  if (!root || currentLanguage === "en") {
    return;
  }
  walkTextNodes(root);
  translateAttributes(root);
}

function installLanguageControl() {
  const actions = document.querySelector(".topbar__actions");
  if (!actions || document.querySelector("#web-language-control")) {
    return;
  }
  actions.insertAdjacentHTML("afterbegin", `
    <label class="language-control" id="web-language-control">
      <span>${localizedHtml("Workspace language")}</span>
      <select aria-label="${localizedHtml("Workspace language")}">
        <option value="en">English</option>
        <option value="hi">Hindi</option>
      </select>
    </label>
  `);
  const select = actions.querySelector("#web-language-control select");
  if (select) {
    select.value = currentLanguage;
    select.addEventListener("change", () => setWebLanguage(select.value));
  }
}

function translateDocument() {
  document.querySelectorAll("#web-language-control select").forEach((select) => {
    select.value = currentLanguage;
  });
  walkTextNodes(document.body);
  translateAttributes(document.body);
}

function observeTranslations() {
  if (observer || !("MutationObserver" in window)) {
    return;
  }
  observer = new MutationObserver((mutations) => {
    if (currentLanguage === "en") {
      return;
    }
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          translateFragment(node);
        }
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function walkTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node);
    node = walker.nextNode();
  }
}

function translateTextNode(node) {
  const parent = node.parentElement;
  if (!parent) {
    return;
  }
  const current = node.nodeValue || "";
  if (!parent.dataset.i18nSource) {
    parent.dataset.i18nSource = current;
  } else {
    const translatedSource = t(parent.dataset.i18nSource);
    if (current && current !== parent.dataset.i18nSource && current !== translatedSource) {
      parent.dataset.i18nSource = current;
    }
  }
  const source = parent.dataset.i18nSource;
  node.nodeValue = currentLanguage === "en" ? source : t(source);
}

function translateAttributes(root) {
  const elements = root.querySelectorAll ? [root, ...root.querySelectorAll("[placeholder], [aria-label], [title]")] : [];
  elements.forEach((element) => {
    ["placeholder", "aria-label", "title"].forEach((attribute) => {
      if (!element.hasAttribute?.(attribute)) {
        return;
      }
      const sourceKey = `i18n${attribute.replace(/(^|-)(\w)/g, (_, __, letter) => letter.toUpperCase())}`;
      if (!element.dataset[sourceKey]) {
        element.dataset[sourceKey] = element.getAttribute(attribute) || "";
      }
      const source = element.dataset[sourceKey];
      element.setAttribute(attribute, currentLanguage === "en" ? source : t(source));
    });
  });
}

function interpolate(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readLanguage() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    return SUPPORTED_LANGUAGES.has(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
