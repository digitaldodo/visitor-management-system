import { publicRequest } from '../api/apiClient';
import { resolveActiveRole } from '../auth/roleResolver';
import type {
  AuthResponseDto,
  AuthSession,
  EmailVerificationDispatchResponseDto,
  EmailVerificationStatusResponseDto,
  ForgotPasswordPayload,
  ForgotPasswordResponseDto,
  LoginPayload,
  ResendEmailVerificationPayload,
  ResetPasswordPayload,
  VerifyPasswordResetOtpPayload,
  VerifyPasswordResetOtpResponseDto,
} from '../types/auth';
import type { UserProfile } from '../types/domain';

function sanitizeRoles(roles: string[] | undefined) {
  return Array.from(new Set((roles ?? []).filter(Boolean))) as AuthSession['user']['roles'];
}

function mapSession(auth: AuthResponseDto, profile: UserProfile, audience: LoginPayload['audience'] | AuthSession['audience']) {
  const roles = sanitizeRoles(auth.roles ?? auth.user?.roles ?? profile.roles);

  return {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    tokenType: auth.tokenType || 'Bearer',
    expiresAt: auth.expiresAt,
    audience,
    lastSyncedAt: new Date().toISOString(),
    user: {
      id: profile.id || auth.user?.id || auth.userId || '',
      username: profile.username || auth.user?.username || auth.username || '',
      email: profile.email || auth.user?.email || auth.email || '',
      fullName: profile.fullName || auth.user?.fullName || auth.fullName || '',
      organizationId: profile.organizationId ?? auth.user?.organizationId ?? auth.organizationId,
      organizationName: profile.organizationName ?? auth.user?.organizationName ?? auth.organizationName,
      organizationCode: profile.organizationCode ?? auth.user?.organizationCode ?? auth.organizationCode,
      organizationTimezone: profile.organizationTimezone ?? auth.user?.organizationTimezone ?? auth.organizationTimezone,
      organizationRegionCountry:
        profile.organizationRegionCountry ?? auth.user?.organizationRegionCountry ?? auth.organizationRegionCountry,
      roles,
      activeRole: resolveActiveRole(roles, audience),
      department: profile.department,
      designation: profile.designation,
      employeeId: profile.employeeId,
      employeePhotoUrl: profile.employeePhotoUrl,
      accountStatus: profile.accountStatus,
    },
  } satisfies AuthSession;
}

export async function login(payload: LoginPayload) {
  const auth = await publicRequest<AuthResponseDto>({
    url: '/auth/login',
    method: 'POST',
    data: {
      identifier: payload.identifier.trim(),
      password: payload.password,
      ...(payload.companyCode?.trim() ? { companyCode: payload.companyCode.trim().toUpperCase() } : {}),
      portalAudience: payload.audience,
    },
  });

  const profile = await fetchCurrentUser(auth.accessToken, auth.tokenType);
  return mapSession(auth, profile, payload.audience);
}

export async function requestPasswordReset(payload: ForgotPasswordPayload) {
  return publicRequest<ForgotPasswordResponseDto>({
    url: '/auth/forgot-password',
    method: 'POST',
    data: {
      identifier: payload.identifier.trim(),
    },
  });
}

export async function resendEmailVerification(payload: ResendEmailVerificationPayload) {
  return publicRequest<EmailVerificationDispatchResponseDto>({
    url: '/auth/resend-verification',
    method: 'POST',
    data: {
      identifier: payload.identifier.trim(),
    },
  });
}

export async function verifyEmail(token: string) {
  return publicRequest<EmailVerificationStatusResponseDto>({
    url: '/auth/verify-email',
    method: 'GET',
    params: {
      token: token.trim(),
    },
  });
}

export async function verifyPasswordResetOtp(payload: VerifyPasswordResetOtpPayload) {
  return publicRequest<VerifyPasswordResetOtpResponseDto>({
    url: '/auth/verify-otp',
    method: 'POST',
    data: {
      identifier: payload.identifier.trim(),
      otp: payload.otp.trim(),
    },
  });
}

export async function resetPassword(payload: ResetPasswordPayload) {
  return publicRequest({
    url: '/auth/reset-password',
    method: 'POST',
    data: {
      resetToken: payload.resetToken,
      newPassword: payload.newPassword,
    },
  });
}

async function fetchCurrentUser(accessToken: string, tokenType = 'Bearer') {
  return publicRequest<UserProfile>({
    url: '/auth/me',
    method: 'GET',
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
    },
  });
}

export async function restoreSession(snapshot: AuthSession, options?: { forceRefresh?: boolean }) {
  let authSnapshot: AuthResponseDto = {
    accessToken: snapshot.accessToken,
    refreshToken: snapshot.refreshToken,
    tokenType: snapshot.tokenType,
    expiresAt: snapshot.expiresAt,
    roles: snapshot.user.roles,
  };

  if (options?.forceRefresh || shouldRefreshSession(snapshot.expiresAt)) {
    authSnapshot = await publicRequest<AuthResponseDto>({
      url: '/auth/refresh',
      method: 'POST',
      data: {
        refreshToken: snapshot.refreshToken,
      },
    });
  }

  const profile = await fetchCurrentUser(authSnapshot.accessToken, authSnapshot.tokenType);
  return mapSession(
    {
      ...authSnapshot,
      refreshToken: authSnapshot.refreshToken || snapshot.refreshToken,
      tokenType: authSnapshot.tokenType || snapshot.tokenType,
    },
    profile,
    snapshot.audience,
  );
}

export async function logout(session: AuthSession | null) {
  if (!session?.refreshToken) {
    return;
  }

  await publicRequest({
    url: '/auth/logout',
    method: 'POST',
    data: {
      refreshToken: session.refreshToken,
    },
  }).catch(() => undefined);
}

function shouldRefreshSession(expiresAt: string) {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!expiresAtMs || Number.isNaN(expiresAtMs)) {
    return true;
  }

  return expiresAtMs - Date.now() <= 90_000;
}
