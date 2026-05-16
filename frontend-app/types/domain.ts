import type { BackendRole } from './auth';

export type VisitorType = 'ONE_TIME' | 'WALK_IN' | 'EMERGENCY' | 'RECURRING' | 'CONTRACTOR_VENDOR';

export type VisitorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'EXPIRED' | 'SUSPENDED';

export type EmployeePresenceAction = 'CHECKED_IN' | 'CHECKED_OUT';

export type UserProfile = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  department?: string | null;
  employeeId?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  employeePhotoUrl?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  emergencyContact?: string | null;
  preferredLanguage?: string | null;
  notificationEmailEnabled?: boolean | null;
  notificationInAppEnabled?: boolean | null;
  active?: boolean | null;
  accountStatus?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  organizationRegionCountry?: string | null;
  roles: BackendRole[];
};

export type VisitorStatusHistoryRecord = {
  status?: VisitorStatus | null;
  action?: string | null;
  actorId?: string | null;
  note?: string | null;
  timestamp?: string | null;
};

export type VisitorRecord = {
  id: string;
  fullName: string;
  phone?: string | null;
  phoneCountryCode?: string | null;
  email?: string | null;
  companyName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  organizationRegionCountry?: string | null;
  purposeOfVisit?: string | null;
  visitorType?: VisitorType | null;
  vendorCompanyName?: string | null;
  hostEmployee?: string | null;
  hostEmployeeId?: string | null;
  hostEmployeeDepartment?: string | null;
  sponsorEmployee?: string | null;
  department?: string | null;
  validityStartDate?: string | null;
  validityEndDate?: string | null;
  recurringSchedule?: string | null;
  allowedWeekdays?: string[] | null;
  allowedEntryStartTime?: string | null;
  allowedEntryEndTime?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  badgeId?: string | null;
  status?: VisitorStatus | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  scheduledTimezone?: string | null;
  accessWindowStartTime?: string | null;
  accessWindowEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  approvalExpiresAt?: string | null;
  preApproved?: boolean;
  qrCode?: string | null;
  qrIssuedAt?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  qrExpiresAt?: string | null;
  badgePrintedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  approvedBy?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  suspendedAt?: string | null;
  suspendedBy?: string | null;
  suspensionReason?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  statusHistory?: VisitorStatusHistoryRecord[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SecurityOverview = {
  area: string;
  metrics: Record<string, number>;
};

export type SecurityMonitoring = {
  counts: Record<string, number>;
  currentlyInside: VisitorRecord[];
  overdueVisitors: VisitorRecord[];
  checkedOutVisitors: VisitorRecord[];
  rejectedVisitors: VisitorRecord[];
  approvedVisitors: VisitorRecord[];
  activeRecurringVisitors: VisitorRecord[];
  expiredRecurringVisitors: VisitorRecord[];
  suspendedVisitors: VisitorRecord[];
  dailyAttendanceLogs: VisitorRecord[];
};

export type EmployeeDirectoryEntry = {
  id: string;
  employeeId?: string | null;
  fullName: string;
  email: string;
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  active: boolean;
  accountStatus?: string | null;
  currentlyIn: boolean;
};

export type EmployeeAttendanceRecord = {
  id: string;
  employeeUserId: string;
  employeeId?: string | null;
  employeeName: string;
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  timezone?: string | null;
  attendanceDate?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  state?: string | null;
  status?: string | null;
  late?: boolean;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  manualCheckIn?: boolean;
  manualCheckOut?: boolean;
  overrideReason?: string | null;
  securityGuardId?: string | null;
  securityGuardName?: string | null;
  lastAction?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type EmployeeBadge = {
  employeeUserId: string;
  employeeId?: string | null;
  fullName: string;
  email: string;
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  employeePhotoUrl?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  qrPayload?: string | null;
  qrImageDataUri?: string | null;
  issuedAt?: string | null;
  active: boolean;
};

export type HostDirectoryEntry = {
  id: string;
  fullName: string;
  email: string;
  username?: string | null;
  department?: string | null;
  organizationName?: string | null;
};

export type WorkforceOnboardingRecord = {
  id: string;
  username?: string | null;
  email: string;
  fullName: string;
  department?: string | null;
  employeeId?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  employeePhotoUrl?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  organizationRegionCountry?: string | null;
  roles: BackendRole[];
  active: boolean;
  accountStatus?: string | null;
  workforceOnboardingCreatedById?: string | null;
  workforceOnboardingCreatedByName?: string | null;
  workforceOnboardingCreatedAt?: string | null;
  workforceApprovedById?: string | null;
  workforceApprovedByName?: string | null;
  workforceApprovedAt?: string | null;
  workforceRejectedById?: string | null;
  workforceRejectedByName?: string | null;
  workforceRejectedAt?: string | null;
  workforceRejectionReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SecurityPhotoUpload = {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
};

export type NotificationRecord = {
  id: string;
  type?: string | null;
  title: string;
  message: string;
  visitorId?: string | null;
  visitorName?: string | null;
  actionUrl?: string | null;
  read: boolean;
  emailStatus?: string | null;
  createdAt?: string | null;
};

export type NotificationInbox = {
  unreadCount: number;
  items: NotificationRecord[];
};

export type QrVerificationResult = {
  valid: boolean;
  recognized: boolean;
  resultCode?: string | null;
  headline?: string | null;
  message?: string | null;
  recommendedAction?: string | null;
  visitorId?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  visitorType?: VisitorType | null;
  vendorCompanyName?: string | null;
  hostEmployee?: string | null;
  hostEmployeeDepartment?: string | null;
  sponsorEmployee?: string | null;
  department?: string | null;
  validityStartDate?: string | null;
  validityEndDate?: string | null;
  recurringSchedule?: string | null;
  allowedWeekdays?: string[] | null;
  allowedEntryStartTime?: string | null;
  allowedEntryEndTime?: string | null;
  photoUrl?: string | null;
  status?: VisitorStatus | null;
  statusLabel?: string | null;
  badgeId?: string | null;
  passCode?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  accessWindowStartTime?: string | null;
  accessWindowEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  overdue?: boolean;
  validityStatus?: string | null;
  canCheckIn?: boolean;
  canCheckOut?: boolean;
};

export type EmployeeScanResult = {
  valid: boolean;
  action?: EmployeePresenceAction | null;
  headline?: string | null;
  message?: string | null;
  recommendedAction?: string | null;
  shiftEligible: boolean;
  currentlyIn: boolean;
  employee?: EmployeeDirectoryEntry | null;
  attendance?: EmployeeAttendanceRecord | null;
};

export type ApiVersionPayload = {
  current: string;
  supported: string[];
  profile: string;
};
