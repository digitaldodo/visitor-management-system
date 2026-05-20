import { useMutation, useQuery } from '@tanstack/react-query';

import {
  getAccountProfile,
  updateAccountPassword,
  updateAccountProfile,
  uploadAccountProfilePhoto,
} from '../services/accountService';

export function useAccountProfile() {
  return useQuery({
    queryKey: ['account', 'profile'],
    queryFn: getAccountProfile,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateAccountProfileMutation() {
  return useMutation({
    mutationFn: updateAccountProfile,
  });
}

export function useUpdateAccountPasswordMutation() {
  return useMutation({
    mutationFn: updateAccountPassword,
  });
}

export function useUploadAccountProfilePhotoMutation() {
  return useMutation({
    mutationFn: uploadAccountProfilePhoto,
  });
}
