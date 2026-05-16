export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  timestamp?: string | null;
};

export type PageResponse<T> = {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};

export type AppError = {
  kind: 'config' | 'network' | 'http' | 'runtime';
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
  recoverable: boolean;
};
