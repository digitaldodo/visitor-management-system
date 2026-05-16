import type { BackendRole } from './auth';

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

export type VisitorRecord = {
  id: string;
  fullName: string;
  email?: string | null;
  companyName?: string | null;
  purposeOfVisit?: string | null;
  hostEmployee?: string | null;
  hostEmployeeDepartment?: string | null;
  badgeId?: string | null;
  status?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  qrExpiresAt?: string | null;
  createdAt?: string | null;
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
  lastAction?: string | null;
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
  status?: string | null;
  statusLabel?: string | null;
  badgeId?: string | null;
  passCode?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  overdue?: boolean;
  validityStatus?: string | null;
  canCheckIn?: boolean;
  canCheckOut?: boolean;
};

export type ApiVersionPayload = {
  current: string;
  supported: string[];
  profile: string;
};
