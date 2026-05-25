const LANGUAGE_KEY = "accessflow.web.language.v1";
const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = new Set(["en", "hi"]);
const TRANSLATION_BATCH_MS = 16;

const translations = Object.freeze({
  hi: Object.freeze({
    "Access control": "एक्सेस नियंत्रण",
    "AccessFlow operations": "AccessFlow संचालन",
    "AccessFlow enterprise control plane": "AccessFlow एंटरप्राइज कंट्रोल प्लेन",
    "AccessFlow operations console": "AccessFlow संचालन कंसोल",
    "AccessFlow visitor portal": "AccessFlow आगंतुक पोर्टल",
    "AccessFlow workflow hub": "AccessFlow वर्कफ़्लो हब",
    "Access Desk": "एक्सेस डेस्क",
    "Active": "सक्रिय",
    "Active Visitors": "सक्रिय आगंतुक",
    "Active access": "सक्रिय एक्सेस",
    "Active incidents": "सक्रिय घटनाएं",
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
    "Approval Workflow": "स्वीकृति वर्कफ़्लो",
    "Approval routing": "स्वीकृति रूटिंग",
    "Approval status": "स्वीकृति स्थिति",
    "Approve": "स्वीकृत करें",
    "Approved": "स्वीकृत",
    "Approved access badge": "स्वीकृत एक्सेस बैज",
    "Audit": "ऑडिट",
    "Audit history": "ऑडिट इतिहास",
    "Audit oversight": "ऑडिट निगरानी",
    "Audit Trail": "ऑडिट ट्रेल",
    "Audit Workspace": "ऑडिट कार्यक्षेत्र",
    "Badge": "बैज",
    "Badge and QR": "बैज और QR",
    "Badge downloaded": "बैज डाउनलोड हुआ",
    "Badge ID": "बैज ID",
    "Badge ready. Present it at the security checkpoint.": "बैज तैयार है। इसे सुरक्षा चेकपॉइंट पर दिखाएं।",
    "Cancel": "रद्द करें",
    "Check details": "विवरण जांचें",
    "Check-in / Check-out": "चेक-इन / चेक-आउट",
    "Check-in activity": "चेक-इन गतिविधि",
    "Check-in desk": "चेक-इन डेस्क",
    "Checked in": "चेक-इन",
    "Checked out": "चेक-आउट",
    "Close": "बंद करें",
    "Confirm": "पुष्टि करें",
    "Confirm action": "कार्रवाई पुष्टि करें",
    "Correction details": "सुधार विवरण",
    "Current badge": "वर्तमान बैज",
    "Current state": "वर्तमान स्थिति",
    "Dashboard": "डैशबोर्ड",
    "Dispatch Critical Alert": "महत्वपूर्ण अलर्ट भेजें",
    "Dispatch panic alert": "पैनिक अलर्ट भेजें",
    "Denied": "अस्वीकृत",
    "Denied Entry Report": "अस्वीकृत प्रवेश रिपोर्ट",
    "Department": "विभाग",
    "Download CSV": "CSV डाउनलोड करें",
    "Download PDF": "PDF डाउनलोड करें",
    "Download report": "रिपोर्ट डाउनलोड करें",
    "Deny workforce onboarding": "कार्यबल ऑनबोर्डिंग अस्वीकृत करें",
    "Emergency": "आपातकाल",
    "Emergency Actions": "आपातकालीन कार्रवाइयां",
    "Emergency Alerts": "आपातकालीन अलर्ट",
    "Emergency Command": "आपातकालीन कमांड",
    "Emergency Ops": "आपात संचालन",
    "Emergency operations": "आपात संचालन",
    "Employee Badge": "कर्मचारी बैज",
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
    "Incident Reports": "घटना रिपोर्ट",
    "Incident Workflow": "घटना वर्कफ़्लो",
    "Inside now": "अभी अंदर",
    "Live register": "लाइव रजिस्टर",
    "Logout": "लॉग आउट",
    "Mark all read": "सभी पढ़ा हुआ करें",
    "Monitoring": "मॉनिटरिंग",
    "Notifications": "सूचनाएं",
    "My Visits": "मेरी विजिट",
    "No audit activity yet": "अभी कोई ऑडिट गतिविधि नहीं",
    "No export snapshots": "अभी कोई एक्सपोर्ट स्नैपशॉट नहीं",
    "No metrics yet": "अभी कोई मीट्रिक नहीं",
    "No notifications": "कोई सूचना नहीं",
    "Operational Audit Log": "संचालन ऑडिट लॉग",
    "Operational exports": "संचालन एक्सपोर्ट",
    "Operational report": "संचालन रिपोर्ट",
    "Operational Summary": "संचालन सारांश",
    "Operational Status": "संचालन स्थिति",
    "Operational Updates": "संचालन अपडेट",
    "Organization": "संगठन",
    "Request onboarding changes": "ऑनबोर्डिंग बदलाव मांगें",
    "Reset temporary password": "अस्थायी पासवर्ड रीसेट करें",
    "Pending": "लंबित",
    "Pending Approvals": "लंबित स्वीकृतियां",
    "Pending approval": "स्वीकृति लंबित",
    "Preferences": "प्राथमिकताएं",
    "Presence": "उपस्थिति",
    "QR Verification": "QR सत्यापन",
    "QR Scanner": "QR स्कैनर",
    "Reason": "कारण",
    "Refresh": "रिफ्रेश",
    "Register visitor": "आगंतुक रजिस्टर करें",
    "Reports": "रिपोर्ट",
    "Request Visit": "विजिट अनुरोध",
    "Requests": "अनुरोध",
    "Reusable Identity": "पुन: प्रयोज्य पहचान",
    "Revoked": "रद्द",
    "Role": "भूमिका",
    "Save": "सेव करें",
    "Security Incident Report": "सुरक्षा घटना रिपोर्ट",
    "Security Dashboard": "सुरक्षा डैशबोर्ड",
    "Security Logs": "सुरक्षा लॉग",
    "Security workspace": "सुरक्षा कार्यक्षेत्र",
    "Share export": "एक्सपोर्ट शेयर करें",
    "Signed in": "साइन इन",
    "Status": "स्थिति",
    "Submitted": "जमा",
    "Suspended": "निलंबित",
    "Timezone": "समय क्षेत्र",
    "Visitor access made simple and secure.": "आगंतुक एक्सेस सरल और सुरक्षित।",
    "Visitor Badge Verification": "आगंतुक बैज सत्यापन",
    "Visitor Verification": "आगंतुक सत्यापन",
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
    "Workspace Preferences": "कार्यस्थल प्राथमिकताएं",
    "Arrival pending": "आगमन लंबित",
    "Badge scan or verification link": "बैज स्कैन या सत्यापन लिंक",
    "Camera Scan": "कैमरा स्कैन",
    "Capture photo": "फोटो कैप्चर करें",
    "Checked-in visitors will appear here.": "चेक-इन किए गए आगंतुक यहां दिखाई देंगे।",
    "Denied Visitors": "अस्वीकृत आगंतुक",
    "Emergency operations clear": "आपात संचालन साफ है",
    "Expected arrivals": "अपेक्षित आगमन",
    "No active visitors": "कोई सक्रिय आगंतुक नहीं",
    "No pending approvals": "कोई लंबित स्वीकृति नहीं",
    "No recent movement": "हाल की कोई आवाजाही नहीं",
    "Profile": "प्रोफ़ाइल",
    "Ready to scan": "स्कैन के लिए तैयार",
    "Recent Check-ins": "हाल के चेक-इन",
    "Recent Movement": "हाल की आवाजाही",
    "Settings": "सेटिंग्स",
    "Verify": "सत्यापित करें",
    "Workspace language": "कार्यस्थल भाषा",
  }),
});

const textSources = new WeakMap();
const attributeSources = new WeakMap();
let currentLanguage = readLanguage();
let observer = null;
let translating = false;
let pendingTranslation = 0;
const pendingRoots = new Set();

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
  if (normalized === currentLanguage) {
    syncLanguageControls();
    return;
  }
  currentLanguage = normalized;
  document.documentElement.lang = normalized;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, normalized);
  } catch {
    // Language selection remains in-memory when storage is unavailable.
  }
  translateDocument();
  window.dispatchEvent(new CustomEvent("accessflow:languagechange", { detail: { language: normalized } }));
}

export function translateFragment(root) {
  if (!root) {
    return;
  }
  runWithoutObserver(() => {
    translateRoot(root);
  });
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
  runWithoutObserver(() => {
    syncLanguageControls();
    translateRoot(document.body);
  });
}

function observeTranslations() {
  if (observer || !("MutationObserver" in window)) {
    return;
  }
  observer = new MutationObserver((mutations) => {
    if (translating) {
      return;
    }
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData" && mutation.target?.parentElement) {
        pendingRoots.add(mutation.target.parentElement);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          pendingRoots.add(node);
        }
        if (node.nodeType === Node.TEXT_NODE) {
          pendingRoots.add(node.parentElement || document.body);
        }
      });
    });
    schedulePendingTranslations();
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function schedulePendingTranslations() {
  if (pendingTranslation) {
    return;
  }
  pendingTranslation = window.setTimeout(() => {
    pendingTranslation = 0;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    runWithoutObserver(() => {
      roots.forEach((root) => {
        if (root?.isConnected) {
          translateRoot(root);
        }
      });
      syncLanguageControls();
    });
  }, TRANSLATION_BATCH_MS);
}

function runWithoutObserver(callback) {
  const wasObserving = Boolean(observer);
  translating = true;
  if (wasObserving) {
    observer.disconnect();
  }
  try {
    callback();
  } finally {
    if (wasObserving) {
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    }
    translating = false;
  }
}

function syncLanguageControls() {
  document.querySelectorAll("#web-language-control select").forEach((select) => {
    select.value = currentLanguage;
  });
}

function translateRoot(root) {
  walkTextNodes(root);
  translateAttributes(root);
}

function walkTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "CODE", "PRE"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest("[data-i18n-ignore]")) {
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
  let source = textSources.get(node);
  if (!source || currentLanguage === "en") {
    source = current;
  } else {
    const translatedSource = t(source);
    if (current && current !== source && current !== translatedSource) {
      source = current;
    }
  }
  textSources.set(node, source);
  const nextValue = currentLanguage === "en" ? source : t(source);
  if (current !== nextValue) {
    node.nodeValue = nextValue;
  }
}

function translateAttributes(root) {
  const elements = root.querySelectorAll ? [root, ...root.querySelectorAll("[placeholder], [aria-label], [title]")] : [];
  elements.forEach((element) => {
    ["placeholder", "aria-label", "title"].forEach((attribute) => {
      if (!element.hasAttribute?.(attribute)) {
        return;
      }
      let sources = attributeSources.get(element);
      if (!sources) {
        sources = {};
        attributeSources.set(element, sources);
      }
      const current = element.getAttribute(attribute) || "";
      if (!Object.prototype.hasOwnProperty.call(sources, attribute) || currentLanguage === "en") {
        sources[attribute] = current;
      } else {
        const translatedSource = t(sources[attribute]);
        if (current && current !== sources[attribute] && current !== translatedSource) {
          sources[attribute] = current;
        }
      }
      const source = sources[attribute];
      const nextValue = currentLanguage === "en" ? source : t(source);
      if (current !== nextValue) {
        element.setAttribute(attribute, nextValue);
      }
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
    if (!stored) {
      return DEFAULT_LANGUAGE;
    }
    if (SUPPORTED_LANGUAGES.has(stored)) {
      return stored;
    }
    window.localStorage.removeItem(LANGUAGE_KEY);
    return DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
