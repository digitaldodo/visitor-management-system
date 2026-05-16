import { apiConfig } from '../api/apiConfig';
import { publicRequest } from '../api/apiClient';
import type { ApiVersionPayload } from '../types/domain';

export async function getApiVersions() {
  if (!apiConfig.versionsUrl) {
    throw new Error('Version endpoint is unavailable because the API base URL is invalid.');
  }

  return publicRequest<ApiVersionPayload>({
    url: apiConfig.versionsUrl,
    method: 'GET',
  });
}

export async function getHealthStatus() {
  return publicRequest<{ status: string; profile: string; uptimeMs: number; checkedAt: string }>({
    url: '/health',
    method: 'GET',
  });
}
