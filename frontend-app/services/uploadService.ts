import { publicRequest, request, type AccessFlowRequestConfig } from '../api/apiClient';
import { createAppError, normalizeApiError } from '../api/error';

export type UploadAsset = {
  uri: string;
  name?: string;
  type?: string;
};

type UploadOptions = {
  url: string;
  asset: UploadAsset;
  fallbackName: string;
  publicUpload?: boolean;
  operationId?: string;
};

const UPLOAD_RETRY_COUNT = 2;

export async function uploadImage<T>({
  url,
  asset,
  fallbackName,
  publicUpload,
  operationId,
}: UploadOptions) {
  const uploadId = operationId ?? createUploadOperationId();
  const config: AccessFlowRequestConfig = {
    url,
    method: 'POST',
    data: createUploadFormData(asset, fallbackName),
    accessFlowMaxNetworkRetries: UPLOAD_RETRY_COUNT,
    accessFlowSkipAuthRefresh: true,
    headers: {
      'Content-Type': 'multipart/form-data',
      'X-AccessFlow-Operation-Id': uploadId,
      'Idempotency-Key': uploadId,
    },
  };

  try {
    return await (publicUpload ? publicRequest<T>(config) : request<T>(config));
  } catch (error) {
    throw normalizeUploadError(error);
  }
}

function createUploadFormData(asset: UploadAsset, fallbackName: string) {
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: asset.name ?? fallbackName,
    type: asset.type ?? 'image/jpeg',
  } as unknown as Blob);
  return formData;
}

function normalizeUploadError(error: unknown) {
  const normalized = normalizeApiError(error);
  const message = normalized.kind === 'network' || normalized.status === 408 || normalized.status === 429 || (normalized.status ?? 0) >= 500
    ? 'Connection issue during upload. Retry upload when the connection is stable.'
    : normalized.kind === 'auth' || normalized.status === 401 || normalized.status === 403
      ? 'Photo upload failed. Continue your session and retry upload.'
      : 'Photo upload failed. Retry upload.';

  return createAppError({
    ...normalized,
    kind: normalized.kind === 'auth' ? 'http' : normalized.kind,
    message,
    recoverable: true,
  });
}

function createUploadOperationId() {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
