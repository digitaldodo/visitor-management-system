import { publicRequest } from '../api/apiClient';

export type OrganizationOption = {
  id: string;
  companyName: string;
  companyCode: string;
  address?: string | null;
  contactEmail?: string | null;
  regionCountry?: string | null;
  timezone?: string | null;
  activeStatus?: boolean;
};

export async function getPublicOrganizations(signal?: AbortSignal) {
  return publicRequest<OrganizationOption[]>({
    url: '/organizations/public',
    method: 'GET',
    signal,
  });
}
