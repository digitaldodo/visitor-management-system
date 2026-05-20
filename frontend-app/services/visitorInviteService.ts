import { publicRequest } from '../api/apiClient';
import type { SecurityPhotoUpload, VisitorInviteRecord } from '../types/domain';

type UploadAsset = {
  uri: string;
  name?: string;
  type?: string;
};

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
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: asset.name ?? 'visitor-invite-photo.jpg',
    type: asset.type ?? 'image/jpeg',
  } as unknown as Blob);

  return publicRequest<SecurityPhotoUpload>({
    url: `/public/visitor-invites/${encodeURIComponent(token)}/photo`,
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function completeVisitorInviteRegistration(token: string, payload: VisitorInviteRegistrationPayload) {
  return publicRequest<VisitorInviteRecord>({
    url: `/public/visitor-invites/${encodeURIComponent(token)}/registration`,
    method: 'POST',
    data: payload,
  });
}
