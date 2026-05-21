import { publicRequest } from '../api/apiClient';
import { uploadImage, type UploadAsset } from './uploadService';
import type { SecurityPhotoUpload, VisitorInviteRecord } from '../types/domain';

export type VisitorInviteRegistrationPayload = {
  fullName: string;
  phoneCountryCode?: string | null;
  phone: string;
  email?: string | null;
  companyName?: string | null;
  purposeOfVisit: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  timezone?: string | null;
  photoUrl: string;
  photoPublicId: string;
};

export async function getPublicVisitorInvite(token: string) {
  return publicRequest<VisitorInviteRecord>({
    url: `/public/visitor-invites/${encodeURIComponent(token)}`,
    method: 'GET',
  });
}

export async function uploadVisitorInvitePhoto(token: string, asset: UploadAsset) {
  return uploadImage<SecurityPhotoUpload>({
    url: `/public/visitor-invites/${encodeURIComponent(token)}/photo`,
    asset,
    fallbackName: 'visitor-invite-photo.jpg',
    publicUpload: true,
  });
}

export async function completeVisitorInviteRegistration(token: string, payload: VisitorInviteRegistrationPayload) {
  return publicRequest<VisitorInviteRecord>({
    url: `/public/visitor-invites/${encodeURIComponent(token)}/registration`,
    method: 'POST',
    data: payload,
  });
}
