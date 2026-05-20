import { request } from '../api/apiClient';
import type { OperationalEventBatch, OperationalReportExport } from '../types/operationalSync';

export async function getOperationalEvents(cursor?: string | null, limit = 80) {
  return request<OperationalEventBatch>({
    url: '/mobile/operations/events',
    method: 'GET',
    params: {
      cursor: cursor || undefined,
      limit,
    },
  });
}

export async function prepareAdminOperationalExport(reportType: string, format: 'CSV' | 'PDF') {
  return request<OperationalReportExport>({
    url: '/admin/reports/export',
    method: 'GET',
    params: { reportType, format },
  });
}

export async function prepareSecurityOperationalExport(reportType: string, format: 'CSV' | 'PDF') {
  return request<OperationalReportExport>({
    url: '/security/reports/export',
    method: 'GET',
    params: { reportType, format },
  });
}
