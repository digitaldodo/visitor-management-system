import { request } from '../api/apiClient';
import type { AdminOperationalReport, SecurityOverview, WorkforceOnboardingRecord } from '../types/domain';

export async function getAdminOverview() {
  return request<SecurityOverview>({
    url: '/admin/overview',
    method: 'GET',
  });
}

export async function getAdminWorkforceOnboarding() {
  return request<WorkforceOnboardingRecord[]>({
    url: '/admin/workforce-onboarding',
    method: 'GET',
  });
}

export async function getAdminReports() {
  return request<AdminOperationalReport[]>({
    url: '/admin/reports',
    method: 'GET',
  });
}
