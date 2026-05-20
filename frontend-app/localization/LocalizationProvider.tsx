import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type SupportedLanguage = 'en' | 'hi';
type LanguagePreference = '' | SupportedLanguage;
type TranslationParams = Record<string, string | number | null | undefined>;

type LocalizationContextValue = {
  language: SupportedLanguage;
  preference: LanguagePreference;
  setLanguagePreference: (language: LanguagePreference) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const LANGUAGE_STORAGE_KEY = 'accessflow.mobile.language-preference.v1';

const translations = {
  en: {
    'app.brandMeta': 'Operational workspace',
    'common.live': 'Ready',
    'common.system': 'System',
    'common.english': 'English',
    'common.hindi': 'Hindi',
    'common.save': 'Save',
    'common.retry': 'Retry',
    'common.unknown': 'Unknown',
    'common.notAvailable': 'Not available',
    'runtime.lockedTitle': 'Workspace locked',
    'runtime.lockedBody': 'The session is paused after inactivity. Resume the workspace from the lock screen to continue.',
    'runtime.updateRequiredTitle': 'Update required',
    'runtime.updateRequiredBody': 'This mobile build is below the backend support floor. Update AccessFlow before continuing operations.',
    'runtime.offlineMode': 'Offline Mode',
    'runtime.syncing': 'Syncing...',
    'runtime.degradedSync': 'Degraded sync',
    'runtime.deviceReview': 'Device review required',
    'runtime.queuedActions': 'Queued actions pending',
    'runtime.notificationsLimited': 'Notifications limited',
    'runtime.offlineBody': 'Cached records are available for known visitors and workforce only. {count} action(s) pending sync.',
    'runtime.offlineBodyNoQueue': 'Cached records are available for known visitors and workforce only. {lastSync}',
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
    'feed.eventRuntimeOffline': 'Runtime entered offline operational mode',
    'feed.eventRuntimeDegraded': 'Runtime sync is degraded',
    'feed.eventRuntimeRecovered': 'Runtime sync healthy',
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
    'settings.languageSubtitle': 'Switch operational language instantly. Hindi copy is optimized for guards and workforce teams.',
    'settings.languageSaved': 'Language updated',
    'settings.languageSavedBody': 'AccessFlow will use this language across supported mobile surfaces.',
    'auth.secureSignIn': 'Secure sign-in',
    'auth.visitorOnboarding': 'Visitor onboarding',
    'auth.recovery': 'Secure account recovery',
    'auth.signIn': 'Sign in',
    'auth.visitor': 'Visitor',
    'auth.recover': 'Recover',
    'auth.continue': 'Continue securely',
    'auth.usernameEmail': 'Username or email',
    'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot Password?',
    'auth.rememberDevice': 'Remember this device',
    'auth.secureWorkspace': 'Secure mobile workspace',
  },
  hi: {
    'app.brandMeta': 'ऑपरेशनल कार्यक्षेत्र',
    'common.live': 'तैयार',
    'common.system': 'सिस्टम',
    'common.english': 'अंग्रेजी',
    'common.hindi': 'हिंदी',
    'common.save': 'सेव करें',
    'common.retry': 'फिर प्रयास करें',
    'common.unknown': 'अज्ञात',
    'common.notAvailable': 'उपलब्ध नहीं',
    'runtime.lockedTitle': 'कार्यस्थल लॉक है',
    'runtime.lockedBody': 'निष्क्रियता के बाद सत्र रोका गया है। जारी रखने के लिए लॉक स्क्रीन से कार्यस्थल फिर शुरू करें।',
    'runtime.updateRequiredTitle': 'अपडेट आवश्यक',
    'runtime.updateRequiredBody': 'यह मोबाइल बिल्ड बैकएंड सपोर्ट सीमा से नीचे है। संचालन जारी रखने से पहले AccessFlow अपडेट करें।',
    'runtime.offlineMode': 'ऑफलाइन मोड',
    'runtime.syncing': 'सिंक हो रहा है...',
    'runtime.degradedSync': 'सिंक सीमित है',
    'runtime.deviceReview': 'डिवाइस समीक्षा आवश्यक',
    'runtime.queuedActions': 'कतारबद्ध कार्रवाई लंबित',
    'runtime.notificationsLimited': 'सूचनाएं सीमित',
    'runtime.offlineBody': 'केवल ज्ञात आगंतुकों और कार्यबल के कैश रिकॉर्ड उपलब्ध हैं। {count} कार्रवाई सिंक के लिए लंबित।',
    'runtime.offlineBodyNoQueue': 'केवल ज्ञात आगंतुकों और कार्यबल के कैश रिकॉर्ड उपलब्ध हैं। {lastSync}',
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
    'feed.eventRuntimeOffline': 'रनटाइम ऑफलाइन ऑपरेशनल मोड में गया',
    'feed.eventRuntimeDegraded': 'रनटाइम सिंक सीमित है',
    'feed.eventRuntimeRecovered': 'रनटाइम सिंक स्वस्थ है',
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
    'settings.languageSubtitle': 'ऑपरेशनल भाषा तुरंत बदलें। हिंदी कॉपी गार्ड और कार्यबल टीमों के लिए अनुकूलित है।',
    'settings.languageSaved': 'भाषा अपडेट हुई',
    'settings.languageSavedBody': 'AccessFlow समर्थित मोबाइल सतहों पर यह भाषा इस्तेमाल करेगा।',
    'auth.secureSignIn': 'सुरक्षित साइन-इन',
    'auth.visitorOnboarding': 'आगंतुक ऑनबोर्डिंग',
    'auth.recovery': 'सुरक्षित खाता रिकवरी',
    'auth.signIn': 'साइन इन',
    'auth.visitor': 'आगंतुक',
    'auth.recover': 'रिकवर',
    'auth.continue': 'सुरक्षित रूप से जारी रखें',
    'auth.usernameEmail': 'यूजरनेम या ईमेल',
    'auth.password': 'पासवर्ड',
    'auth.forgotPassword': 'पासवर्ड भूल गए?',
    'auth.rememberDevice': 'इस डिवाइस को याद रखें',
    'auth.secureWorkspace': 'सुरक्षित मोबाइल कार्यक्षेत्र',
  },
} as const;

type TranslationKey = keyof typeof translations.en;

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<LanguagePreference>('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((value) => {
        if (!active) {
          return;
        }
        setPreference(value === 'hi' || value === 'en' ? value : '');
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

  const setLanguagePreference = useCallback(async (nextLanguage: LanguagePreference) => {
    const normalized = nextLanguage === 'hi' || nextLanguage === 'en' ? nextLanguage : '';
    setPreference(normalized);
    if (normalized) {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
      return;
    }
    await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
  }, []);

  const language = preference || detectDeviceLanguage();
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => interpolate(translations[language][key] ?? translations.en[key] ?? key, params),
    [language],
  );

  const value = useMemo<LocalizationContextValue>(
    () => ({
      language,
      preference,
      setLanguagePreference,
      t,
    }),
    [language, preference, setLanguagePreference, t],
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

function detectDeviceLanguage(): SupportedLanguage {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase() || '';
  return locale.startsWith('hi') ? 'hi' : 'en';
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
