import * as Updates from 'expo-updates';

import { apiConfig } from '../api/apiConfig';
import { recordDiagnosticEvent } from './diagnostics';
import { recordOperationalMetric } from './telemetry';
import type { OtaUpdateState } from '../types/runtime';

export function readOtaUpdateState(): OtaUpdateState {
  return {
    enabled: Boolean(Updates.isEnabled),
    channel: Updates.channel ?? apiConfig.releaseChannel,
    runtimeVersion: Updates.runtimeVersion ?? apiConfig.runtimeVersion,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt?.toISOString() ?? null,
    isEmbeddedLaunch: Boolean(Updates.isEmbeddedLaunch),
    isEmergencyLaunch: Boolean(Updates.isEmergencyLaunch),
    emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
    checkInProgress: false,
    updateAvailable: false,
    updateDownloaded: false,
    rollbackAvailable: false,
    lastCheckedAt: null,
    message: Updates.isEmergencyLaunch
      ? 'AccessFlow recovered with the embedded runtime after an update launch failure.'
      : null,
  };
}

export async function checkForOtaUpdate(options?: { forceDownload?: boolean }) {
  const initial = readOtaUpdateState();
  if (!Updates.isEnabled || __DEV__) {
    return {
      ...initial,
      lastCheckedAt: new Date().toISOString(),
      message: 'OTA updates are not enabled for this development runtime.',
    } satisfies OtaUpdateState;
  }

  const nextState = {
    ...initial,
    checkInProgress: true,
    lastCheckedAt: new Date().toISOString(),
  } satisfies OtaUpdateState;

  try {
    await Updates.setExtraParamAsync('accessflow-channel', apiConfig.releaseChannel).catch(() => undefined);
    await Updates.setExtraParamAsync('accessflow-environment', apiConfig.environment).catch(() => undefined);
    const result = await Updates.checkForUpdateAsync();
    const updateAvailable = Boolean(result.isAvailable);
    const rollbackAvailable = Boolean(result.isRollBackToEmbedded);
    let updateDownloaded = false;

    if ((updateAvailable || rollbackAvailable) && options?.forceDownload) {
      const fetchResult = await Updates.fetchUpdateAsync();
      updateDownloaded = Boolean(fetchResult.isNew || fetchResult.isRollBackToEmbedded);
    }

    await recordOperationalMetric({
      name: 'app_health',
      tags: {
        updateAvailable,
        rollbackAvailable,
        channel: Updates.channel ?? apiConfig.releaseChannel,
      },
    });

    return {
      ...nextState,
      checkInProgress: false,
      updateAvailable,
      updateDownloaded,
      rollbackAvailable,
      message: updateDownloaded
        ? 'An AccessFlow update is downloaded and ready to apply.'
        : updateAvailable
          ? 'A compatible AccessFlow update is available.'
          : rollbackAvailable
            ? 'A safe rollback to the embedded runtime is available.'
            : null,
    } satisfies OtaUpdateState;
  } catch (error) {
    await recordDiagnosticEvent({
      level: 'warn',
      scope: 'runtime',
      code: 'OTA_UPDATE_CHECK_FAILED',
      message: error instanceof Error ? error.message : 'OTA update check failed.',
      context: {
        channel: apiConfig.releaseChannel,
        environment: apiConfig.environment,
      },
    });

    return {
      ...nextState,
      checkInProgress: false,
      message: 'AccessFlow could not check for OTA updates. The embedded runtime remains active.',
    } satisfies OtaUpdateState;
  }
}

export async function applyDownloadedOtaUpdate() {
  if (!Updates.isEnabled || __DEV__) {
    return;
  }

  await recordDiagnosticEvent({
    level: 'info',
    scope: 'runtime',
    code: 'OTA_UPDATE_APPLYING',
    message: 'Applying downloaded OTA update.',
    context: {
      channel: apiConfig.releaseChannel,
    },
  });
  await Updates.reloadAsync();
}
