import { recordDiagnosticEvent } from './diagnostics';
import { registerFirebaseBackgroundMessageHandler, trackFirebaseEvent, type FirebaseMessagePayload } from './firebaseRuntime';

export function registerAccessFlowFirebaseBackgroundHandlers() {
  registerFirebaseBackgroundMessageHandler(async (message: FirebaseMessagePayload) => {
    const data = message.data ?? {};
    await trackFirebaseEvent('notification_received', {
      source: 'background',
      type: data.type ?? null,
      category: data.category ?? null,
      priority: data.priority ?? null,
    });
    await recordDiagnosticEvent({
      level: 'info',
      scope: 'notification',
      code: 'FCM_BACKGROUND_MESSAGE_RECEIVED',
      message: 'AccessFlow received an FCM notification while backgrounded.',
      context: {
        type: data.type ?? null,
        category: data.category ?? null,
        priority: data.priority ?? null,
      },
    });
  });
}
