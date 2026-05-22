import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { enterpriseStaticTextTranslations } from './locales/enterpriseText';

export type SupportedLanguage = 'en' | 'hi';
type LanguagePreference = '' | SupportedLanguage;
type TranslationParams = Record<string, string | number | null | undefined>;

type LocalizationContextValue = {
  language: SupportedLanguage;
  preference: LanguagePreference;
  isHydrated: boolean;
  setLanguagePreference: (language: SupportedLanguage) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  tText: (text?: string | null, params?: TranslationParams) => string;
};

const LANGUAGE_STORAGE_KEY = 'accessflow.mobile.language-preference.v1';
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

type StoredLanguagePreference = {
  version: 2;
  language: SupportedLanguage;
  source: 'manual';
};

const translations = {
  en: {
    'app.brandMeta': 'Operational workspace',
    'nav.qr': 'QR',
    'nav.pending': 'Pending',
    'nav.approvalStatus': 'Approval Status',
    'nav.dashboard': 'Dashboard',
    'nav.approvals': 'Approvals',
    'nav.visitors': 'Visitors',
    'nav.workforce': 'Workforce',
    'nav.register': 'Register',
    'nav.alerts': 'Alerts',
    'nav.emergency': 'Emergency',
    'nav.profile': 'Profile',
    'nav.badge': 'Badge',
    'nav.requests': 'Requests',
    'nav.presence': 'Presence',
    'nav.notifications': 'Notifications',
    'nav.home': 'Home',
    'nav.request': 'Request',
    'nav.pass': 'Pass',
    'nav.employees': 'Employees',
    'nav.activity': 'Activity',
    'nav.more': 'More',
    'common.live': 'Ready',
    'common.english': 'English',
    'common.hindi': 'Hindi',
    'common.save': 'Save',
    'common.retry': 'Retry',
    'common.ready': 'Ready',
    'common.reconnecting': 'Ready',
    'common.unknown': 'Unknown',
    'common.notAvailable': 'Not available',
    'runtime.lockedTitle': 'Workspace locked',
    'runtime.lockedBody': 'Use device unlock once to resume this protected workspace.',
    'runtime.updateRequiredTitle': 'Update required',
    'runtime.updateRequiredBody': 'Your organization requires a newer AccessFlow mobile release before operations can continue.',
    'runtime.offlineMode': 'Connection limited',
    'runtime.syncing': 'Updating securely...',
    'runtime.degradedSync': 'Connection limited',
    'runtime.deviceReview': 'Device review required',
    'runtime.queuedActions': 'Queued actions pending',
    'runtime.notificationsLimited': 'Notifications limited',
    'runtime.offlineBody': 'Known visitor and workforce records remain available. {count} action(s) will finish when the connection returns.',
    'runtime.offlineBodyNoQueue': 'Known visitor and workforce records remain available. {lastSync}',
    'runtime.syncingBody': 'Back online. AccessFlow is safely replaying queued checkpoint actions and refreshing operational records.',
    'runtime.suspiciousBody': 'This device was flagged by session policy. AccessFlow has limited operations until the session is safely resumed.',
    'runtime.queuedBody': '{count} action(s) queued, including {scanCount} scan(s). Access is marked provisional until sync confirms.',
    'runtime.pushDeniedBody': 'Push notifications are turned off on this device. In-app alerts will still appear while the app is open.',
    'runtime.noSyncTime': 'No local sync timestamp is available yet.',
    'runtime.lastSync': 'Last sync {time}.',
    'feed.tab': 'Activity',
    'feed.title': 'Organization Activity',
    'feed.subtitle': 'Organization-scoped visitor, workforce, incident, approval, and alert activity.',
    'feed.summaryLive': 'Activity',
    'feed.summaryAlerts': 'Priority alerts',
    'feed.summaryQueued': 'Queued actions',
    'feed.summaryOffline': 'Connection',
    'feed.summarySynced': 'Available',
    'feed.filtersAll': 'All',
    'feed.filtersPriority': 'Priority',
    'feed.filtersVisitors': 'Visitors',
    'feed.filtersWorkforce': 'Workforce',
    'feed.filtersApprovals': 'Approvals',
    'feed.filtersSync': 'Sync',
    'feed.streamTitle': 'Activity feed',
    'feed.streamSubtitle': 'Events are grouped by repeated activity and scoped to this organization.',
    'feed.emptyTitle': 'No operational activity yet',
    'feed.emptyBody': 'Visitor, workforce, approval, incident, and notification activity will appear here.',
    'feed.offlineBannerTitle': 'Offline-aware feed',
    'feed.offlineBannerBody': 'This stream includes cached and queued local events. Treat offline items as provisional until sync confirms.',
    'feed.pendingSync': 'Pending sync',
    'feed.generatedOffline': 'Generated offline',
    'feed.grouped': '{count} related events',
    'feed.openRecord': 'Open record',
    'feed.sourceNotification': 'Notification',
    'feed.sourceRuntime': 'AccessFlow',
    'feed.sourcePlatform': 'AccessFlow operations',
    'feed.sourceOffline': 'Queued action',
    'feed.sourceVisitor': 'Visitor operations',
    'feed.sourceWorkforce': 'Workforce operations',
    'feed.actorSystem': 'AccessFlow',
    'feed.actorGuard': 'Security team',
    'feed.actorAdmin': 'Admin team',
    'feed.actorEmployee': 'Employee',
    'feed.eventCheckedIn': 'Visitor {name} checked in',
    'feed.eventCheckedOut': 'Visitor {name} checked out',
    'feed.eventApproved': 'Visitor {name} approved',
    'feed.eventPendingApproval': 'Visitor {name} awaiting approval',
    'feed.eventDenied': 'Entry denied for visitor {name}',
    'feed.eventSuspended': 'Badge suspended for {name}',
    'feed.eventRevoked': 'Badge revoked for {name}',
    'feed.eventVisitorUpdated': 'Visitor {name} updated',
    'feed.eventExpired': 'Visitor {name} overdue or expired',
    'feed.eventWorkforceIn': '{name} checked in for workforce duty',
    'feed.eventWorkforceOut': '{name} checked out from workforce duty',
    'feed.eventWorkforceApproved': 'Workforce profile approved for {name}',
    'feed.eventWorkforcePending': 'Workforce approval pending for {name}',
    'feed.eventWorkforceDenied': 'Workforce access denied for {name}',
    'feed.eventIncident': 'Security incident created for {name}',
    'feed.eventNotification': '{title}',
    'feed.eventOfflineQueued': '{title} queued for sync',
    'feed.eventRuntimeOffline': 'Connection temporarily limited',
    'feed.eventRuntimeDegraded': 'Secure connection is being restored',
    'feed.eventRuntimeRecovered': 'Connection restored',
    'feed.eventSuspiciousDevice': 'Device posture needs security review',
    'feed.eventEmergency': 'Emergency alert active',
    'feed.detailOrganization': 'Organization',
    'feed.detailCheckpoint': 'Checkpoint',
    'feed.detailSynced': 'Synced',
    'feed.detailStale': 'Stale',
    'feed.severityInfo': 'Info',
    'feed.severityWarning': 'Warning',
    'feed.severityAlert': 'Security alert',
    'feed.severityEmergency': 'Emergency',
    'feed.severityApproval': 'Approval',
    'feed.severityDenied': 'Denied',
    'settings.languageTitle': 'Preferred language',
    'settings.languageSubtitle': 'Choose the app language manually. Device language never changes AccessFlow automatically.',
    'settings.languageSaved': 'Language updated',
    'settings.languageSavedBody': 'AccessFlow will keep this language on this device until you change it again.',
    'auth.secureSignIn': 'Sign in',
    'auth.visitorOnboarding': 'Visitor onboarding',
    'auth.recovery': 'Secure account recovery',
    'auth.signIn': 'Sign in',
    'auth.visitor': 'Visitor',
    'auth.recover': 'Recover',
    'auth.continue': 'Continue',
    'auth.usernameEmail': 'Username or email',
    'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot Password?',
    'auth.workspace': 'Enterprise workspace',
  },
  hi: {
    'app.brandMeta': 'ऑपरेशनल कार्यक्षेत्र',
    'nav.qr': 'QR',
    'nav.pending': 'लंबित',
    'nav.approvalStatus': 'स्वीकृति स्थिति',
    'nav.dashboard': 'डैशबोर्ड',
    'nav.approvals': 'स्वीकृतियां',
    'nav.visitors': 'आगंतुक',
    'nav.workforce': 'कार्यबल',
    'nav.register': 'रजिस्टर',
    'nav.alerts': 'अलर्ट',
    'nav.emergency': 'आपातकाल',
    'nav.profile': 'प्रोफाइल',
    'nav.badge': 'बैज',
    'nav.requests': 'अनुरोध',
    'nav.presence': 'उपस्थिति',
    'nav.notifications': 'सूचनाएं',
    'nav.home': 'होम',
    'nav.request': 'अनुरोध',
    'nav.pass': 'पास',
    'nav.employees': 'कर्मचारी',
    'nav.activity': 'गतिविधि',
    'nav.more': 'अधिक',
    'common.live': 'तैयार',
    'common.english': 'अंग्रेजी',
    'common.hindi': 'हिंदी',
    'common.save': 'सेव करें',
    'common.retry': 'फिर प्रयास करें',
    'common.ready': 'तैयार',
    'common.reconnecting': 'तैयार',
    'common.unknown': 'अज्ञात',
    'common.notAvailable': 'उपलब्ध नहीं',
    'runtime.lockedTitle': 'कार्यस्थल लॉक है',
    'runtime.lockedBody': 'इस सुरक्षित कार्यक्षेत्र को फिर शुरू करने के लिए एक बार डिवाइस अनलॉक करें।',
    'runtime.updateRequiredTitle': 'अपडेट आवश्यक',
    'runtime.updateRequiredBody': 'संचालन जारी रखने से पहले आपके संगठन को नया AccessFlow मोबाइल रिलीज चाहिए।',
    'runtime.offlineMode': 'कनेक्शन सीमित',
    'runtime.syncing': 'सुरक्षित रूप से अपडेट हो रहा है...',
    'runtime.degradedSync': 'कनेक्शन सीमित',
    'runtime.deviceReview': 'डिवाइस समीक्षा आवश्यक',
    'runtime.queuedActions': 'कतारबद्ध कार्रवाई लंबित',
    'runtime.notificationsLimited': 'सूचनाएं सीमित',
    'runtime.offlineBody': 'ज्ञात आगंतुक और कार्यबल रिकॉर्ड उपलब्ध रहेंगे। कनेक्शन लौटने पर {count} कार्रवाई पूरी होगी।',
    'runtime.offlineBodyNoQueue': 'ज्ञात आगंतुक और कार्यबल रिकॉर्ड उपलब्ध रहेंगे। {lastSync}',
    'runtime.syncingBody': 'कनेक्शन वापस आ गया है। AccessFlow कतारबद्ध चेकपॉइंट कार्रवाइयों को सुरक्षित रूप से सिंक कर रहा है।',
    'runtime.suspiciousBody': 'यह डिवाइस सत्र नीति द्वारा चिन्हित है। सुरक्षित पुनरारंभ तक संचालन सीमित रहेगा।',
    'runtime.queuedBody': '{count} कार्रवाई कतार में हैं, जिनमें {scanCount} स्कैन शामिल हैं। सिंक पुष्टि तक एक्सेस अस्थायी माना जाएगा।',
    'runtime.pushDeniedBody': 'इस डिवाइस पर पुश सूचनाएं बंद हैं। ऐप खुले रहने पर इन-ऐप अलर्ट मिलते रहेंगे।',
    'runtime.noSyncTime': 'अभी स्थानीय सिंक समय उपलब्ध नहीं है।',
    'runtime.lastSync': 'अंतिम सिंक {time}।',
    'feed.tab': 'गतिविधि',
    'feed.title': 'संगठन गतिविधि',
    'feed.subtitle': 'इस संगठन के आगंतुक, कार्यबल, घटना, अनुमति और अलर्ट गतिविधि।',
    'feed.summaryLive': 'गतिविधि',
    'feed.summaryAlerts': 'प्राथमिक अलर्ट',
    'feed.summaryQueued': 'कतारबद्ध कार्रवाई',
    'feed.summaryOffline': 'कनेक्शन',
    'feed.summarySynced': 'उपलब्ध',
    'feed.filtersAll': 'सभी',
    'feed.filtersPriority': 'प्राथमिक',
    'feed.filtersVisitors': 'आगंतुक',
    'feed.filtersWorkforce': 'कार्यबल',
    'feed.filtersApprovals': 'अनुमतियां',
    'feed.filtersSync': 'सिंक',
    'feed.streamTitle': 'गतिविधि फीड',
    'feed.streamSubtitle': 'दोहराई गई गतिविधियां समूहित होती हैं और इसी संगठन तक सीमित रहती हैं।',
    'feed.emptyTitle': 'अभी कोई ऑपरेशनल गतिविधि नहीं',
    'feed.emptyBody': 'आगंतुक, कार्यबल, अनुमति, घटना और सूचना गतिविधि यहां दिखेगी।',
    'feed.offlineBannerTitle': 'ऑफलाइन-सक्षम फीड',
    'feed.offlineBannerBody': 'इस स्ट्रीम में कैश और कतारबद्ध स्थानीय घटनाएं शामिल हैं। सिंक पुष्टि तक ऑफलाइन आइटम अस्थायी मानें।',
    'feed.pendingSync': 'सिंक लंबित',
    'feed.generatedOffline': 'ऑफलाइन बनाई गई',
    'feed.grouped': '{count} संबंधित घटनाएं',
    'feed.openRecord': 'रिकॉर्ड खोलें',
    'feed.sourceNotification': 'सूचना',
    'feed.sourceRuntime': 'AccessFlow',
    'feed.sourcePlatform': 'AccessFlow संचालन',
    'feed.sourceOffline': 'कतारबद्ध कार्रवाई',
    'feed.sourceVisitor': 'आगंतुक संचालन',
    'feed.sourceWorkforce': 'कार्यबल संचालन',
    'feed.actorSystem': 'AccessFlow',
    'feed.actorGuard': 'सुरक्षा टीम',
    'feed.actorAdmin': 'प्रशासन टीम',
    'feed.actorEmployee': 'कर्मचारी',
    'feed.eventCheckedIn': 'आगंतुक {name} ने चेक-इन किया',
    'feed.eventCheckedOut': 'आगंतुक {name} ने चेक-आउट किया',
    'feed.eventApproved': 'आगंतुक {name} स्वीकृत',
    'feed.eventPendingApproval': 'आगंतुक {name} अनुमति की प्रतीक्षा में',
    'feed.eventDenied': 'आगंतुक {name} का प्रवेश अस्वीकृत',
    'feed.eventSuspended': '{name} का बैज निलंबित',
    'feed.eventRevoked': '{name} का बैज रद्द',
    'feed.eventVisitorUpdated': 'आगंतुक {name} अपडेट हुआ',
    'feed.eventExpired': 'आगंतुक {name} ओवरड्यू या समाप्त',
    'feed.eventWorkforceIn': '{name} ने कार्यबल ड्यूटी में चेक-इन किया',
    'feed.eventWorkforceOut': '{name} ने कार्यबल ड्यूटी से चेक-आउट किया',
    'feed.eventWorkforceApproved': '{name} का कार्यबल प्रोफाइल स्वीकृत',
    'feed.eventWorkforcePending': '{name} की कार्यबल अनुमति लंबित',
    'feed.eventWorkforceDenied': '{name} का कार्यबल एक्सेस अस्वीकृत',
    'feed.eventIncident': '{name} के लिए सुरक्षा घटना बनाई गई',
    'feed.eventNotification': '{title}',
    'feed.eventOfflineQueued': '{title} सिंक के लिए कतारबद्ध',
    'feed.eventRuntimeOffline': 'कनेक्शन अस्थायी रूप से सीमित है',
    'feed.eventRuntimeDegraded': 'सुरक्षित कनेक्शन बहाल हो रहा है',
    'feed.eventRuntimeRecovered': 'कनेक्शन बहाल हुआ',
    'feed.eventSuspiciousDevice': 'डिवाइस पोस्टर की सुरक्षा समीक्षा आवश्यक',
    'feed.eventEmergency': 'आपातकालीन अलर्ट सक्रिय',
    'feed.detailOrganization': 'संगठन',
    'feed.detailCheckpoint': 'चेकपॉइंट',
    'feed.detailSynced': 'सिंक हुआ',
    'feed.detailStale': 'पुराना डेटा',
    'feed.severityInfo': 'जानकारी',
    'feed.severityWarning': 'चेतावनी',
    'feed.severityAlert': 'सुरक्षा अलर्ट',
    'feed.severityEmergency': 'आपातकाल',
    'feed.severityApproval': 'स्वीकृति',
    'feed.severityDenied': 'अस्वीकृत',
    'settings.languageTitle': 'पसंदीदा भाषा',
    'settings.languageSubtitle': 'ऐप की भाषा मैन्युअल रूप से चुनें। डिवाइस भाषा AccessFlow को अपने-आप नहीं बदलती।',
    'settings.languageSaved': 'भाषा अपडेट हुई',
    'settings.languageSavedBody': 'AccessFlow इस डिवाइस पर यही भाषा रखेगा जब तक आप इसे फिर नहीं बदलते।',
    'auth.secureSignIn': 'साइन इन',
    'auth.visitorOnboarding': 'आगंतुक ऑनबोर्डिंग',
    'auth.recovery': 'सुरक्षित खाता रिकवरी',
    'auth.signIn': 'साइन इन',
    'auth.visitor': 'आगंतुक',
    'auth.recover': 'रिकवर',
    'auth.continue': 'जारी रखें',
    'auth.usernameEmail': 'यूजरनेम या ईमेल',
    'auth.password': 'पासवर्ड',
    'auth.forgotPassword': 'पासवर्ड भूल गए?',
    'auth.workspace': 'एंटरप्राइज कार्यक्षेत्र',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

const staticTextTranslations = {
  hi: {
    'AccessFlow Mobile': 'AccessFlow मोबाइल',
    'Ready': 'तैयार',
    'Profile': 'प्रोफाइल',
    'Language': 'भाषा',
    'Settings': 'सेटिंग्स',
    'Manage your identity, secure account settings, and role-scoped AccessFlow workspace.': 'अपनी पहचान, सुरक्षित खाता सेटिंग और भूमिका-आधारित AccessFlow कार्यक्षेत्र प्रबंधित करें।',
    'Employee identity, credential status, personal settings, and secure account controls.': 'कर्मचारी पहचान, क्रेडेंशियल स्थिति, निजी सेटिंग और सुरक्षित खाता नियंत्रण।',
    'Security guard identity, checkpoint readiness, and secure account controls.': 'सुरक्षा गार्ड पहचान, चेकपॉइंट तैयारी और सुरक्षित खाता नियंत्रण।',
    'Visitor identity, pass status, and secure account controls.': 'आगंतुक पहचान, पास स्थिति और सुरक्षित खाता नियंत्रण।',
    'Admin settings': 'एडमिन सेटिंग्स',
    'Mobile role scope, session controls, and operational readiness.': 'मोबाइल भूमिका दायरा, सत्र नियंत्रण और संचालन तैयारी।',
    'Choose the app language manually. Device language never changes AccessFlow automatically.': 'ऐप की भाषा मैन्युअल रूप से चुनें। डिवाइस भाषा AccessFlow को अपने-आप नहीं बदलती।',
    'Profile photo': 'प्रोफाइल फोटो',
    'Check username': 'यूजरनेम जांचें',
    'Use 3-32 lowercase letters, numbers, or underscores.': '3-32 छोटे अक्षर, नंबर या अंडरस्कोर उपयोग करें।',
    'Profile update failed': 'प्रोफाइल अपडेट विफल',
    'Your account profile could not be updated.': 'आपकी खाता प्रोफाइल अपडेट नहीं हो सकी।',
    'Profile updated': 'प्रोफाइल अपडेट हुई',
    'Your account profile was updated.': 'आपकी खाता प्रोफाइल अपडेट हो गई।',
    'Capture or select a square profile photo. Preview it before applying it to your account and credential surfaces.': 'चौकोर प्रोफाइल फोटो कैप्चर या चुनें। खाते और क्रेडेंशियल पर लगाने से पहले पूर्वावलोकन देखें।',
    'Camera': 'कैमरा',
    'Gallery': 'गैलरी',
    'Retake': 'फिर लें',
    'Remove': 'हटाएं',
    'Cancel': 'रद्द करें',
    'Preview ready': 'पूर्वावलोकन तैयार',
    'Review the crop before replacing the current account photo.': 'मौजूदा खाता फोटो बदलने से पहले क्रॉप जांचें।',
    'Apply photo': 'फोटो लागू करें',
    'Photo unavailable': 'फोटो उपलब्ध नहीं',
    'The photo picker could not be opened. Check permission settings and try again.': 'फोटो पिकर नहीं खुल सका। अनुमति सेटिंग जांचें और फिर प्रयास करें।',
    'Photo updated': 'फोटो अपडेट हुई',
    'Your profile and credential photo were refreshed.': 'आपकी प्रोफाइल और क्रेडेंशियल फोटो रिफ्रेश हो गई।',
    'Photo update failed': 'फोटो अपडेट विफल',
    'Your profile photo could not be updated.': 'आपकी प्रोफाइल फोटो अपडेट नहीं हो सकी।',
    'Remove profile photo?': 'प्रोफाइल फोटो हटाएं?',
    'This clears the user-managed profile photo while organization credentials remain controlled by AccessFlow.': 'यह यूजर-प्रबंधित प्रोफाइल फोटो साफ करता है, जबकि संगठन क्रेडेंशियल AccessFlow के नियंत्रण में रहते हैं।',
    'Photo removal failed': 'फोटो हटाना विफल',
    'The photo could not be removed.': 'फोटो हटाई नहीं जा सकी।',
    'Editable account details': 'संपादन योग्य खाता विवरण',
    'These fields belong to you. Organization-controlled identity and access fields stay locked below.': 'ये फ़ील्ड आपके हैं। संगठन-नियंत्रित पहचान और एक्सेस फ़ील्ड नीचे लॉक रहते हैं।',
    'Username': 'यूजरनेम',
    'Lowercase letters, numbers, and underscores only.': 'केवल छोटे अक्षर, नंबर और अंडरस्कोर।',
    'Emergency contact': 'आपातकालीन संपर्क',
    'Emergency contact number or note': 'आपातकालीन संपर्क नंबर या नोट',
    'In-app alerts': 'इन-ऐप अलर्ट',
    'Receive account, approval, pass, and operational notifications inside AccessFlow.': 'AccessFlow में खाता, स्वीकृति, पास और संचालन सूचनाएं पाएं।',
    'Email alerts': 'ईमेल अलर्ट',
    'Receive operational notifications by email when delivery is enabled for your organization.': 'आपके संगठन में डिलीवरी सक्षम होने पर ईमेल से संचालन सूचनाएं पाएं।',
    'Enable notifications': 'सूचनाएं सक्षम करें',
    'Open Android notification settings': 'Android सूचना सेटिंग खोलें',
    'Save account changes': 'खाता बदलाव सेव करें',
    'Log out': 'लॉग आउट',
    'Sign out safely': 'सुरक्षित रूप से साइन आउट',
    'Photo on file': 'फोटो मौजूद है',
    'Photo pending': 'फोटो लंबित',
    'Verified email pending': 'सत्यापित ईमेल लंबित',
    'Admin workspace': 'प्रशासन कार्यक्षेत्र',
    'Employee workspace': 'कर्मचारी कार्यक्षेत्र',
    'Security workspace': 'सुरक्षा कार्यक्षेत्र',
    'Visitor workspace': 'आगंतुक कार्यक्षेत्र',
    'Shift': 'शिफ्ट',
    'All caught up': 'सब पूरा',
    '{count} unread': '{count} अपठित',
    'Mark all read': 'सभी पढ़ा हुआ करें',
    'Read': 'पढ़ा हुआ',
    'New': 'नया',
    'Operational update': 'संचालन अपडेट',
    'No operational notifications': 'कोई संचालन सूचना नहीं',
    'Approvals, arrivals, access revocations, security alerts, and account updates will appear here.': 'स्वीकृतियां, आगमन, एक्सेस रद्दीकरण, सुरक्षा अलर्ट और खाता अपडेट यहां दिखेंगे।',
    'Security': 'सुरक्षा',
    'Visitor': 'आगंतुक',
    'Workforce': 'कार्यबल',
    'System': 'सिस्टम',
    'items': 'आइटम',
    '{count} items': '{count} आइटम',
    'Just now': 'अभी',
    'Preparing workspace': 'कार्यस्थल तैयार हो रहा है',
    'AccessFlow is loading operational data and restoring a secure mobile session.': 'AccessFlow संचालन डेटा लोड कर रहा है और सुरक्षित मोबाइल सत्र बहाल कर रहा है।',
    'Dismiss notification': 'सूचना बंद करें',
    'OK': 'ठीक है',
    'Reliable access for every role': 'हर भूमिका के लिए भरोसेमंद एक्सेस',
    'Sign in, recover access, or onboard as a visitor with role-aware routing and smooth Android workflows.': 'भूमिका-सचेत रूटिंग और सहज Android वर्कफ़्लो के साथ साइन इन करें, एक्सेस रिकवर करें या आगंतुक के रूप में ऑनबोर्ड हों।',
    'Protected access': 'सुरक्षित एक्सेस',
    'Session continuity': 'सत्र निरंतरता',
    'Enterprise roles': 'एंटरप्राइज भूमिकाएं',
    'Pass status and visit requests': 'पास स्थिति और विजिट अनुरोध',
    'Checkpoint and scan operations': 'चेकपॉइंट और स्कैन संचालन',
    'Badge, approvals, and presence': 'बैज, स्वीकृतियां और उपस्थिति',
    'Org Admin': 'संगठन एडमिन',
    'Organization approvals and visibility': 'संगठन स्वीकृतियां और दृश्यता',
    'Start typing to search. The organization list stays hidden until then.': 'खोजने के लिए टाइप करना शुरू करें। तब तक संगठन सूची छिपी रहेगी।',
    'Visitor onboarding started': 'आगंतुक ऑनबोर्डिंग शुरू',
    'Account recovery': 'खाता रिकवरी',
    'Sign in was not accepted': 'साइन इन स्वीकार नहीं हुआ',
    'Connection issue': 'कनेक्शन समस्या',
    'Service unavailable': 'सेवा उपलब्ध नहीं',
    'Session expired': 'सत्र समाप्त',
    'Account locked': 'खाता लॉक है',
    'Mobile access unavailable': 'मोबाइल एक्सेस उपलब्ध नहीं',
    'Connection temporarily unavailable': 'कनेक्शन अस्थायी रूप से उपलब्ध नहीं',
    'Unable to complete request': 'अनुरोध पूरा नहीं हो सका',
    'Recovery complete': 'रिकवरी पूरी',
    'Create a verified visitor account.': 'सत्यापित आगंतुक खाता बनाएं।',
    'Verify and reset your password.': 'सत्यापित करें और पासवर्ड रीसेट करें।',
    'Choose a workspace and sign in.': 'कार्यस्थल चुनें और साइन इन करें।',
    'Create a verified visitor account with clear steps and less mobile form friction.': 'स्पष्ट चरणों और कम मोबाइल फॉर्म झंझट के साथ सत्यापित आगंतुक खाता बनाएं।',
    'Your password has been reset and previous sessions were cleared.': 'आपका पासवर्ड रीसेट हो गया है और पिछले सत्र साफ कर दिए गए हैं।',
    'Verify your email code, then set a new password without exposing saved credentials.': 'ईमेल कोड सत्यापित करें, फिर सहेजे क्रेडेंशियल दिखाए बिना नया पासवर्ड सेट करें।',
    'Choose your workspace and sign in.': 'अपना कार्यस्थल चुनें और साइन इन करें।',
    'Full name': 'पूरा नाम',
    'Your full name': 'आपका पूरा नाम',
    'Email': 'ईमेल',
    'Password': 'पासवर्ड',
    'Identity': 'पहचान',
    'Contact': 'संपर्क',
    'Email or username': 'ईमेल या यूजरनेम',
    'Send verification code': 'सत्यापन कोड भेजें',
    '6 digit code': '6 अंकों का कोड',
    'Resend': 'फिर भेजें',
    'Verify code': 'कोड सत्यापित करें',
    'New password': 'नया पासवर्ड',
    'Confirm password': 'पासवर्ड पुष्टि करें',
    'Use 12 or more characters. Existing sessions will be revoked.': '12 या अधिक अक्षर उपयोग करें। मौजूदा सत्र रद्द होंगे।',
    'Update password': 'पासवर्ड अपडेट करें',
    'Restart recovery': 'रिकवरी फिर शुरू करें',
    'Account access restored': 'खाता एक्सेस बहाल',
    'All refresh sessions were revoked by the backend. Sign in again with the new password.': 'बैकएंड ने सभी रिफ्रेश सत्र रद्द कर दिए। नए पासवर्ड से फिर साइन इन करें।',
    'Return to sign in': 'साइन इन पर लौटें',
    'Code': 'कोड',
    'Preparing visitor, workforce, approval, notification, and incident activity.': 'आगंतुक, कार्यबल, स्वीकृति, सूचना और घटना गतिविधि तैयार हो रही है।',
    'Your workspace is focused on role-specific tasks and notifications.': 'आपका कार्यस्थल भूमिका-विशिष्ट कार्यों और सूचनाओं पर केंद्रित है।',
    'Activity is admin-only': 'गतिविधि केवल एडमिन के लिए',
    'Your mobile workspace shows the tasks and notifications for your role.': 'आपका मोबाइल कार्यस्थल आपकी भूमिका के कार्य और सूचनाएं दिखाता है।',
    'Emergency broadcast': 'आपातकालीन प्रसारण',
    'Send high-priority operational guidance to in-app and push notification channels.': 'इन-ऐप और पुश सूचना चैनलों पर उच्च-प्राथमिकता संचालन निर्देश भेजें।',
    'Your workspace receives emergency broadcasts and lockdown alerts through banners and notifications.': 'आपका कार्यस्थल बैनर और सूचनाओं से आपातकालीन प्रसारण और लॉकडाउन अलर्ट पाता है।',
    'Loaded': 'लोड हुआ',
    'Unread alerts': 'अपठित अलर्ट',
    'Save': 'सेव करें',
    'Continue': 'जारी रखें',
    'Organization-managed identity': 'संगठन-प्रबंधित पहचान',
    'These fields are read-only on mobile and remain controlled by authorized organization administrators.': 'ये फ़ील्ड मोबाइल पर केवल पढ़ने योग्य हैं और अधिकृत संगठन प्रशासकों द्वारा नियंत्रित रहते हैं।',
    'Organization': 'संगठन',
    'Role / workspace': 'भूमिका / कार्यक्षेत्र',
    'Employee ID': 'कर्मचारी ID',
    'Department': 'विभाग',
    'Designation': 'पदनाम',
    'Password and security': 'पासवर्ड और सुरक्षा',
    'Sensitive account updates are validated by the backend and refresh-token state is cleared after password changes.': 'संवेदनशील खाता बदलाव बैकएंड से सत्यापित होते हैं और पासवर्ड बदलने के बाद रिफ्रेश-टोकन स्थिति साफ होती है।',
    'Current password': 'मौजूदा पासवर्ड',
    '12+ chars with upper, lower, number, symbol': '12+ अक्षर, अपर, लोअर, नंबर, सिंबल',
    'Confirm new password': 'नया पासवर्ड पुष्टि करें',
    'Missing details': 'जानकारी अधूरी है',
    'Enter the current password, a new password, and confirmation.': 'मौजूदा पासवर्ड, नया पासवर्ड और पुष्टि दर्ज करें।',
    'Passwords do not match': 'पासवर्ड मेल नहीं खाते',
    'Confirm the new password exactly before saving.': 'सेव करने से पहले नया पासवर्ड ठीक से पुष्टि करें।',
    'Password is not strong enough': 'पासवर्ड पर्याप्त मजबूत नहीं है',
    'Use 12-128 characters with uppercase, lowercase, number, and symbol.': '12-128 अक्षर उपयोग करें, जिनमें अपरकेस, लोअरकेस, नंबर और सिंबल हों।',
    'Password updated': 'पासवर्ड अपडेट हुआ',
    'For security, AccessFlow will sign you out because active refresh tokens were revoked.': 'सुरक्षा के लिए AccessFlow आपको साइन आउट करेगा क्योंकि सक्रिय रिफ्रेश टोकन रद्द हो गए।',
    'Password update failed': 'पासवर्ड अपडेट विफल',
    'The password could not be updated.': 'पासवर्ड अपडेट नहीं हो सका।',
    'Passwords do not match.': 'पासवर्ड मेल नहीं खाते।',
    'Security center': 'सुरक्षा केंद्र',
    'Session': 'सत्र',
    'Active': 'सक्रिय',
    'Storage': 'स्टोरेज',
    'Encrypted tokens': 'एन्क्रिप्टेड टोकन',
    'Refresh': 'रिफ्रेश',
    'Automatic': 'स्वचालित',
    'Push identity': 'पुश पहचान',
    'Mapped': 'मैप्ड',
    'Refresh session': 'सत्र रिफ्रेश करें',
    'Internal diagnostics': 'आंतरिक डायग्नोस्टिक्स',
    'Environment': 'पर्यावरण',
    'Distribution': 'डिस्ट्रिब्यूशन',
    'App version': 'ऐप संस्करण',
    'Runtime version': 'रनटाइम संस्करण',
    'Build ID': 'बिल्ड ID',
    'Release channel': 'रिलीज चैनल',
    'OTA status': 'OTA स्थिति',
    'Crash reporting': 'क्रैश रिपोर्टिंग',
    'Native Firebase': 'नेटिव Firebase',
    'Previous crash': 'पिछला क्रैश',
    'Unsent crash reports': 'न भेजी गई क्रैश रिपोर्ट',
    'Sync health': 'सिंक स्वास्थ्य',
    'API reachable': 'API उपलब्ध',
    'Network': 'नेटवर्क',
    'Offline queue': 'ऑफलाइन कतार',
    'Last offline sync': 'अंतिम ऑफलाइन सिंक',
    'Push permission': 'पुश अनुमति',
    'Runtime health': 'रनटाइम स्वास्थ्य',
    'Legal and compliance': 'कानूनी और अनुपालन',
    'Review the mobile policy experience from settings at any time.': 'मोबाइल नीति अनुभव को सेटिंग्स से कभी भी देखें।',
    'Privacy Policy': 'गोपनीयता नीति',
    'Terms & Conditions': 'नियम और शर्तें',
    'Operational mode': 'ऑपरेशनल मोड',
  },
} as const;

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<LanguagePreference>('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then(async (value) => {
        if (!active) {
          return;
        }
        const storedPreference = parseStoredLanguagePreference(value);
        setPreference(storedPreference);
        if (value && !storedPreference) {
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, serializeLanguagePreference(DEFAULT_LANGUAGE)).catch(() => undefined);
        }
      })
      .catch(() => {
        if (active) {
          setPreference('');
        }
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setLanguagePreference = useCallback(async (nextLanguage: SupportedLanguage) => {
    const normalized = normalizeSupportedLanguage(nextLanguage);
    setPreference(normalized);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, serializeLanguagePreference(normalized));
  }, []);

  const language = preference || DEFAULT_LANGUAGE;
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => interpolate(translations[language][key] ?? translations.en[key] ?? key, params),
    [language],
  );
  const tText = useCallback(
    (text?: string | null, params?: TranslationParams) => {
      if (!text) {
        return '';
      }
      const translated = language === 'hi'
        ? enterpriseStaticTextTranslations.hi[text as keyof typeof enterpriseStaticTextTranslations.hi]
          ?? staticTextTranslations.hi[text as keyof typeof staticTextTranslations.hi]
          ?? text
        : text;
      return interpolate(translated, params);
    },
    [language],
  );

  const value = useMemo<LocalizationContextValue>(
    () => ({
      language,
      preference,
      isHydrated: hydrated,
      setLanguagePreference,
      t,
      tText,
    }),
    [hydrated, language, preference, setLanguagePreference, t, tText],
  );

  if (!hydrated) {
    return null;
  }

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within LocalizationProvider.');
  }
  return context;
}

function interpolate(template: string, params?: TranslationParams) {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

function parseStoredLanguagePreference(value?: string | null): LanguagePreference {
  if (!value) {
    return '';
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredLanguagePreference> | null;
    if (parsed?.version === 2 && parsed.source === 'manual') {
      return normalizeSupportedLanguage(parsed.language);
    }
  } catch {
    return value === DEFAULT_LANGUAGE ? DEFAULT_LANGUAGE : '';
  }

  return '';
}

function serializeLanguagePreference(language: SupportedLanguage) {
  return JSON.stringify({
    version: 2,
    language: normalizeSupportedLanguage(language),
    source: 'manual',
  } satisfies StoredLanguagePreference);
}

function normalizeSupportedLanguage(language?: string | null): SupportedLanguage {
  return language === 'hi' ? 'hi' : DEFAULT_LANGUAGE;
}
