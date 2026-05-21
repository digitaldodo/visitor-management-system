import { request } from '../api/apiClient';
import { uploadImage, type UploadAsset } from './uploadService';
import type { SecurityPhotoUpload, UserProfile } from '../types/domain';

export type { UploadAsset };

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
  return uploadImage<SecurityPhotoUpload>({
    url: '/auth/profile/photo',
    asset,
    fallbackName: 'account-photo.jpg',
  });
}
