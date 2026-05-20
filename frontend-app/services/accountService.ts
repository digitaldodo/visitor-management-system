import { request } from '../api/apiClient';
import type { SecurityPhotoUpload, UserProfile } from '../types/domain';

export type UploadAsset = {
  uri: string;
  name?: string;
  type?: string;
};

export type AccountProfileUpdatePayload = {
  username?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  emergencyContact?: string | null;
  preferredLanguage?: string | null;
  employeePhotoUrl?: string | null;
  notificationEmailEnabled?: boolean;
  notificationInAppEnabled?: boolean;
};

export type AccountPasswordUpdatePayload = {
  currentPassword: string;
  newPassword: string;
};

export async function getAccountProfile() {
  return request<UserProfile>({
    url: '/auth/me',
    method: 'GET',
  });
}

export async function updateAccountProfile(payload: AccountProfileUpdatePayload) {
  return request<UserProfile>({
    url: '/auth/profile',
    method: 'PATCH',
    data: payload,
  });
}

export async function updateAccountPassword(payload: AccountPasswordUpdatePayload) {
  return request<{ success: boolean }>({
    url: '/auth/profile/password',
    method: 'PATCH',
    data: payload,
  });
}

export async function uploadAccountProfilePhoto(asset: UploadAsset) {
  return request<SecurityPhotoUpload>({
    url: '/auth/profile/photo',
    method: 'POST',
    data: createUploadFormData(asset),
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

function createUploadFormData(asset: UploadAsset) {
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: asset.name ?? 'account-photo.jpg',
    type: asset.type ?? 'image/jpeg',
  } as unknown as Blob);
  return formData;
}
