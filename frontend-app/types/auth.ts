import type { BackendRole } from './workflow';

export type { BackendRole };

export type WorkspaceAudience = 'admin' | 'employee' | 'security' | 'visitor';

export type ActiveWorkspaceRole = 'ADMIN' | 'EMPLOYEE' | 'SECURITY_GUARD' | 'VISITOR';

export type LoginPayload = {
  identifier: string;
  password: string;
  companyCode?: string;
  audience: WorkspaceAudience;
};

export type ForgotPasswordPayload = {
  identifier: string;
};

export type VerifyPasswordResetOtpPayload = {
  identifier: string;
  otp: string;
};

export type ResetPasswordPayload = {
  resetToken: string;
  newPassword: string;
};

export type ForgotPasswordResponseDto = {
  accepted: boolean;
  expiresAt?: string | null;
};

export type VerifyPasswordResetOtpResponseDto = {
  resetToken: string;
  expiresAt?: string | null;
};

export type VisitorRegisterPayload = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  companyCode: string;
  companyName?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  organizationRegionCountry?: string | null;
  roles: BackendRole[];
  activeRole: ActiveWorkspaceRole;
  department?: string | null;
  designation?: string | null;
  employeeId?: string | null;
  employeePhotoUrl?: string | null;
  accountStatus?: string | null;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
  audience: WorkspaceAudience;
  user: AuthUser;
  lastSyncedAt: string;
};

export type AuthBootstrapState =
  | {
      status: 'bootstrapping';
      session: null;
      lastError: null;
    }
  | {
      status: 'signed-out';
      session: null;
      lastError: string | null;
    }
  | {
      status: 'authenticated';
      session: AuthSession;
      lastError: null;
    };

export type AuthResponseDto = {
  success?: boolean;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
  userId?: string;
  username?: string;
  email?: string;
  fullName?: string;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  organizationRegionCountry?: string | null;
  roles?: BackendRole[];
  user?: {
    id?: string;
    username?: string;
    email?: string;
    fullName?: string;
    organizationId?: string | null;
    organizationName?: string | null;
    organizationCode?: string | null;
    organizationTimezone?: string | null;
    organizationRegionCountry?: string | null;
    roles?: BackendRole[];
  };
};
