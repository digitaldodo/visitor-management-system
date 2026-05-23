import { getEmployeeBadge, getEmployeeProfile } from "./accessService.js";

let badgeState = {
  badge: null,
  profile: null,
  error: null,
  promise: null,
};

export async function loadEmployeeBadgeIdentity(options = {}) {
  const { force = false } = options;
  if (!force && badgeState.badge) {
    return {
      badge: badgeState.badge,
      profile: badgeState.profile,
      error: null,
    };
  }
  if (!force && badgeState.promise) {
    return badgeState.promise;
  }

  badgeState.promise = (async () => {
    const [badgeResponse, profileResponse] = await Promise.allSettled([
      getEmployeeBadge("/employee"),
      getEmployeeProfile(),
    ]);

    if (badgeResponse.status !== "fulfilled") {
      const error = badgeResponse.reason || new Error("Employee badge could not be loaded.");
      badgeState = { ...badgeState, error, promise: null };
      throw error;
    }

    const badgeData = badgeResponse.value?.data || null;
    const profileData = profileResponse.status === "fulfilled" ? profileResponse.value?.data || null : null;
    const badge = mergeBadgeProfile(badgeData, profileData);
    badgeState = {
      badge,
      profile: profileData,
      error: null,
      promise: null,
    };
    return {
      badge,
      profile: profileData,
      error: null,
    };
  })();

  try {
    return await badgeState.promise;
  } catch (error) {
    badgeState.promise = null;
    throw error;
  }
}

export function updateEmployeeBadgeCache(badge, profile = badgeState.profile) {
  badgeState = {
    badge: badge && typeof badge === "object" ? badge : null,
    profile: profile && typeof profile === "object" ? profile : null,
    error: null,
    promise: null,
  };
  return badgeState.badge;
}

export function getCachedEmployeeBadgeIdentity() {
  return {
    badge: badgeState.badge,
    profile: badgeState.profile,
    error: badgeState.error,
    loading: Boolean(badgeState.promise),
  };
}

function mergeBadgeProfile(badge, profile) {
  if (!badge || typeof badge !== "object") {
    return null;
  }
  if (!profile || typeof profile !== "object") {
    return badge;
  }
  return {
    ...badge,
    fullName: badge.fullName || profile.fullName || profile.name,
    employeeId: badge.employeeId || profile.employeeId,
    department: badge.department || profile.department,
    designation: badge.designation || profile.designation,
    employeePhotoUrl: badge.employeePhotoUrl || profile.employeePhotoUrl || profile.profilePhotoUrl,
    organizationName: badge.organizationName || profile.organizationName,
    organizationCode: badge.organizationCode || profile.organizationCode,
    organizationTimezone: badge.organizationTimezone || profile.organizationTimezone,
  };
}
