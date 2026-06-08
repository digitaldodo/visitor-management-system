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
    "AccessFlow visitor workspace": "AccessFlow आगंतुक कार्यक्षेत्र",
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
    "Current register": "वर्तमान रजिस्टर",
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
    "Account": "खाता",
    "Opening front desk operations...": "फ्रंट डेस्क संचालन खुल रहा है...",
    "Arrival pending": "आगमन लंबित",
    "Badge and QR": "बैज और QR",
    "Badge pending": "बैज लंबित",
    "Badge response was empty.": "बैज प्रतिक्रिया खाली थी।",
    "Badge scan or verification link": "बैज स्कैन या सत्यापन लिंक",
    "Badge station ready": "बैज स्टेशन तैयार है",
    "Badges unavailable": "बैज उपलब्ध नहीं",
    "Browser camera or secure file capture": "ब्राउज़र कैमरा या सुरक्षित फ़ाइल कैप्चर",
    "Camera permission is requested only when Camera Scan is selected.": "कैमरा अनुमति केवल Camera Scan चुनने पर मांगी जाती है।",
    "Camera scan unavailable": "कैमरा स्कैन उपलब्ध नहीं",
    "Camera status unavailable": "कैमरा स्थिति उपलब्ध नहीं",
    "Camera unavailable": "कैमरा उपलब्ध नहीं",
    "Camera Scan": "कैमरा स्कैन",
    "Cancel invite": "आमंत्रण रद्द करें",
    "Capture photo": "फोटो कैप्चर करें",
    "Capture or upload photo": "फोटो कैप्चर या अपलोड करें",
    "Check access role": "एक्सेस भूमिका जांचें",
    "Check email": "ईमेल जांचें",
    "Check-in and check-out activity will appear here.": "चेक-इन और चेक-आउट गतिविधि यहां दिखाई देगी।",
    "Checked-in visitors will appear here.": "चेक-इन किए गए आगंतुक यहां दिखाई देंगे।",
    "Choose a supported workforce access role.": "समर्थित कार्यबल एक्सेस भूमिका चुनें।",
    "Clear": "साफ",
    "Command center": "कमांड केंद्र",
    "Copy link": "लिंक कॉपी करें",
    "Copy subject ID": "विषय ID कॉपी करें",
    "Current organization": "वर्तमान संगठन",
    "Currently Inside": "अभी अंदर",
    "Denied requests will appear here.": "अस्वीकृत अनुरोध यहां दिखाई देंगे।",
    "Denied Visitors": "अस्वीकृत आगंतुक",
    "Department pending": "विभाग लंबित",
    "Device readiness will appear when details are available.": "विवरण उपलब्ध होने पर डिवाइस तैयारी दिखाई देगी।",
    "Email not recorded": "ईमेल दर्ज नहीं",
    "Employee badge scan": "कर्मचारी बैज स्कैन",
    "Employee lookup unavailable": "कर्मचारी खोज उपलब्ध नहीं",
    "Employee scan complete": "कर्मचारी स्कैन पूरा",
    "Employee QR denied": "कर्मचारी QR अस्वीकृत",
    "Employee scan failed": "कर्मचारी स्कैन विफल",
    "Emergency action failed": "आपात कार्रवाई विफल",
    "Emergency action recorded": "आपात कार्रवाई दर्ज हुई",
    "Emergency feed unavailable": "आपात फीड उपलब्ध नहीं",
    "Emergency incidents are loading.": "आपात घटनाएं लोड हो रही हैं।",
    "Emergency lockdown active": "आपात लॉकडाउन सक्रिय है",
    "Emergency operations clear": "आपात संचालन साफ है",
    "Emergency operations could not be loaded.": "आपात संचालन लोड नहीं हो सका।",
    "Enter at least 8 characters before revoking an invite.": "आमंत्रण रद्द करने से पहले कम से कम 8 अक्षर दर्ज करें।",
    "Evacuation register active": "निकासी रजिस्टर सक्रिय है",
    "Evacuation register unavailable": "निकासी रजिस्टर उपलब्ध नहीं",
    "Evacuation support": "निकासी सहायता",
    "Expected arrivals": "अपेक्षित आगमन",
    "Flag visitor": "आगंतुक फ़्लैग करें",
    "Flag workforce": "कार्यबल फ़्लैग करें",
    "Front Desk Operations": "फ्रंट डेस्क संचालन",
    "Front Desk Registration": "फ्रंट डेस्क पंजीकरण",
    "Generate audit-safe CSV or print-ready PDF exports for visitor, workforce, incident, denied-entry, and governance workflows.": "आगंतुक, कार्यबल, घटना, अस्वीकृत प्रवेश, और गवर्नेंस वर्कफ़्लो के लिए ऑडिट-सुरक्षित CSV या प्रिंट-तैयार PDF एक्सपोर्ट बनाएं।",
    "Guard Account": "गार्ड खाता",
    "Guard Workspace": "गार्ड कार्यक्षेत्र",
    "Identity": "पहचान",
    "Identity is loaded from the active protected session.": "पहचान सक्रिय सुरक्षित सत्र से लोड होती है।",
    "Identity Workspace": "पहचान कार्यक्षेत्र",
    "Incident report": "घटना रिपोर्ट",
    "Incident stream": "घटना स्ट्रीम",
    "Loading incidents": "घटनाएं लोड हो रही हैं",
    "Loading operations": "संचालन लोड हो रहे हैं",
    "Loading register": "रजिस्टर लोड हो रहा है",
    "Loading Security Dashboard": "सुरक्षा डैशबोर्ड लोड हो रहा है",
    "Main Gate": "मुख्य गेट",
    "Manual check-in": "मैनुअल चेक-इन",
    "Manual check-out": "मैनुअल चेक-आउट",
    "Manual workforce check-in": "मैनुअल कार्यबल चेक-इन",
    "Manual workforce check-out": "मैनुअल कार्यबल चेक-आउट",
    "Mobile": "मोबाइल",
    "Name": "नाम",
    "No active check-ins": "कोई सक्रिय चेक-इन नहीं",
    "No active visitors": "कोई सक्रिय आगंतुक नहीं",
    "No active invites": "कोई सक्रिय आमंत्रण नहीं",
    "No approved arrivals": "कोई स्वीकृत आगमन नहीं",
    "No approved passes": "कोई स्वीकृत पास नहीं",
    "No denied visitors": "कोई अस्वीकृत आगंतुक नहीं",
    "No emergency incidents": "कोई आपात घटना नहीं",
    "No employees found": "कोई कर्मचारी नहीं मिला",
    "No overdue visitors": "कोई विलंबित आगंतुक नहीं",
    "No pending approvals": "कोई लंबित स्वीकृति नहीं",
    "No recent check-outs": "हाल के चेक-आउट नहीं",
    "No recent movement": "हाल की कोई आवाजाही नहीं",
    "No submitted requests": "कोई जमा अनुरोध नहीं",
    "No suspended visitors": "कोई निलंबित आगंतुक नहीं",
    "No visitors inside": "अंदर कोई आगंतुक नहीं",
    "No workforce presence logs": "कोई कार्यबल उपस्थिति लॉग नहीं",
    "On site": "साइट पर",
    "Open approvals": "स्वीकृतियां खोलें",
    "Open badge": "बैज खोलें",
    "Open emergency": "आपात खोलें",
    "Operational feed unavailable": "संचालन फीड उपलब्ध नहीं",
    "Operator": "ऑपरेटर",
    "Overdue Visitors": "विलंबित आगंतुक",
    "Overdue visitors": "विलंबित आगंतुक",
    "Panic alert active": "पैनिक अलर्ट सक्रिय है",
    "Panic alert dispatched": "पैनिक अलर्ट भेजा गया",
    "Panic alerts": "पैनिक अलर्ट",
    "Panic workflow": "पैनिक वर्कफ़्लो",
    "People Currently Inside": "अभी अंदर लोग",
    "Photo Capture": "फोटो कैप्चर",
    "Photo capture is ready. Use queue actions or QR verification to attach identity photos.": "फोटो कैप्चर तैयार है। पहचान फोटो जोड़ने के लिए कतार कार्रवाई या QR सत्यापन का उपयोग करें।",
    "Photo capture starts from the desk browser or secure file picker.": "फोटो कैप्चर डेस्क ब्राउज़र या सुरक्षित फ़ाइल पिकर से शुरू होता है।",
    "Photo optional before admin approval": "एडमिन स्वीकृति से पहले फोटो वैकल्पिक है",
    "Preparing this security workspace.": "यह सुरक्षा कार्यक्षेत्र तैयार हो रहा है।",
    "Preferred language": "पसंदीदा भाषा",
    "Profile": "प्रोफ़ाइल",
    "QR scanner": "QR स्कैनर",
    "Quick actions": "त्वरित कार्रवाइयां",
    "Ready to scan": "स्कैन के लिए तैयार",
    "Ready for camera or hardware scanner": "कैमरा या हार्डवेयर स्कैनर के लिए तैयार",
    "Ready for employee scan": "कर्मचारी स्कैन के लिए तैयार",
    "Reason required": "कारण आवश्यक",
    "Recent Check-ins": "हाल के चेक-इन",
    "Recent Movement": "हाल की आवाजाही",
    "Reception Operations": "रिसेप्शन संचालन",
    "Record ID copied": "रिकॉर्ड ID कॉपी हुआ",
    "Recurring": "आवर्ती",
    "Report incident": "घटना रिपोर्ट करें",
    "Response and audit": "प्रतिक्रिया और ऑडिट",
    "Restricted": "प्रतिबंधित",
    "Scan employee": "कर्मचारी स्कैन करें",
    "Scan needed": "स्कैन आवश्यक",
    "Scan QR": "QR स्कैन करें",
    "Scan the visitor badge, verify its current approval state, then record check-in or check-out from the result panel.": "आगंतुक बैज स्कैन करें, उसकी वर्तमान स्वीकृति स्थिति सत्यापित करें, फिर परिणाम पैनल से चेक-इन या चेक-आउट दर्ज करें।",
    "Scan or paste an employee badge QR.": "कर्मचारी बैज QR स्कैन या पेस्ट करें।",
    "Scan or paste a visitor badge link.": "आगंतुक बैज लिंक स्कैन या पेस्ट करें।",
    "Scan or paste the static employee QR payload": "स्थिर कर्मचारी QR पेलोड स्कैन या पेस्ट करें",
    "Scan a badge URL or paste the verification link": "बैज URL स्कैन करें या सत्यापन लिंक पेस्ट करें",
    "Scan history": "स्कैन इतिहास",
    "Search employee, department, ID": "कर्मचारी, विभाग, ID खोजें",
    "Search visitor, host, company, QR": "आगंतुक, होस्ट, कंपनी, QR खोजें",
    "Security can submit details and print a receipt. QR and badge access activate only after organization admin approval.": "सुरक्षा विवरण जमा कर सकती है और रसीद प्रिंट कर सकती है। QR और बैज एक्सेस संगठन एडमिन स्वीकृति के बाद ही सक्रिय होंगे।",
    "Security logs": "सुरक्षा लॉग",
    "Security note": "सुरक्षा नोट",
    "Security Report Exports": "सुरक्षा रिपोर्ट एक्सपोर्ट",
    "Security report failed": "सुरक्षा रिपोर्ट विफल",
    "Security report ready": "सुरक्षा रिपोर्ट तैयार",
    "Security workspace": "सुरक्षा कार्यक्षेत्र",
    "Session behavior": "सत्र व्यवहार",
    "Session persistence": "सत्र स्थिरता",
    "Settings": "सेटिंग्स",
    "Shift Snapshot": "शिफ्ट स्नैपशॉट",
    "Submitted requests unavailable": "जमा अनुरोध उपलब्ध नहीं",
    "Submit for approval": "स्वीकृति के लिए जमा करें",
    "Submit Workforce Onboarding": "कार्यबल ऑनबोर्डिंग जमा करें",
    "Suspended Visitors": "निलंबित आगंतुक",
    "This security workspace could not be loaded.": "यह सुरक्षा कार्यक्षेत्र लोड नहीं हो सका।",
    "Unaccounted": "अगणित",
    "Use a hardware scanner or paste the QR payload.": "हार्डवेयर स्कैनर का उपयोग करें या QR पेलोड पेस्ट करें।",
    "Use a hardware scanner or paste the employee QR payload.": "हार्डवेयर स्कैनर का उपयोग करें या कर्मचारी QR पेलोड पेस्ट करें।",
    "Use secure file upload": "सुरक्षित फ़ाइल अपलोड का उपयोग करें",
    "Use the workspace language control": "कार्यस्थल भाषा नियंत्रण का उपयोग करें",
    "Verify": "सत्यापित करें",
    "Verification failed": "सत्यापन विफल",
    "Verification unavailable": "सत्यापन उपलब्ध नहीं",
    "Verification Workspace": "सत्यापन कार्यक्षेत्र",
    "View all": "सभी देखें",
    "Visitor access": "आगंतुक एक्सेस",
    "Visitor and workforce approval workflows will appear here.": "आगंतुक और कार्यबल स्वीकृति वर्कफ़्लो यहां दिखाई देंगे।",
    "Visitor Badge Verification": "आगंतुक बैज सत्यापन",
    "Visitor Incident": "आगंतुक घटना",
    "Visitor management": "आगंतुक प्रबंधन",
    "Visitor operations": "आगंतुक संचालन",
    "Visitor Operations": "आगंतुक संचालन",
    "Visitor pre-registration invites will appear here with resend and revoke controls.": "आगंतुक प्री-रजिस्ट्रेशन आमंत्रण पुनः भेजने और रद्द करने के नियंत्रणों के साथ यहां दिखाई देंगे।",
    "Visitor verification": "आगंतुक सत्यापन",
    "Visitor verification approvals": "आगंतुक सत्यापन स्वीकृतियां",
    "Visitors": "आगंतुक",
    "Workspace language": "कार्यस्थल भाषा",
    "Workspace unavailable": "कार्यस्थल उपलब्ध नहीं",
    "Workforce access": "कार्यबल एक्सेस",
    "Workforce approvals": "कार्यबल स्वीकृतियां",
    "Workforce ID and note required": "कार्यबल ID और नोट आवश्यक",
    "Workforce Incident": "कार्यबल घटना",
    "Workforce member": "कार्यबल सदस्य",
    "Workforce member name": "कार्यबल सदस्य का नाम",
    "Workforce member name required": "कार्यबल सदस्य का नाम आवश्यक",
    "Workforce onboarding requests created by this security account will appear here with admin decision status.": "इस सुरक्षा खाते से बनाए गए कार्यबल ऑनबोर्डिंग अनुरोध एडमिन निर्णय स्थिति के साथ यहां दिखाई देंगे।",
    "Workforce user ID": "कार्यबल उपयोगकर्ता ID",
    "Workforce Presence Logs": "कार्यबल उपस्थिति लॉग",
    "You are viewing a focused route-based security workspace. Use the sidebar to switch workflows without losing session state.": "आप केंद्रित रूट-आधारित सुरक्षा कार्यक्षेत्र देख रहे हैं। सत्र स्थिति खोए बिना वर्कफ़्लो बदलने के लिए साइडबार का उपयोग करें।",
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
