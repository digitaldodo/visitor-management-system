import type { BackendRole } from './auth';
import type { VersionHandshakePayload } from './runtime';

export type VisitorType = 'ONE_TIME' | 'WALK_IN' | 'EMERGENCY' | 'RECURRING' | 'CONTRACTOR_VENDOR';

export type VisitorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'EXPIRED' | 'SUSPENDED';
export type VisitorInviteStatus = 'SENT' | 'VIEWED' | 'REGISTRATION_COMPLETED' | 'QR_ISSUED' | 'ARRIVED' | 'EXPIRED' | 'REVOKED';

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

export type VisitorInviteRecord = {
  id: string;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  hostEmployeeId?: string | null;
  hostEmployeeName?: string | null;
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
  phoneCountryCode?: string | null;
  companyName?: string | null;
  purposeOfVisit?: string | null;
  visitorType?: VisitorType | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  timezone?: string | null;
  approvalRequired?: boolean;
  status: VisitorInviteStatus;
  inviteUrl?: string | null;
  expiresAt?: string | null;
  viewedAt?: string | null;
  registrationCompletedAt?: string | null;
  qrIssuedAt?: string | null;
  arrivedAt?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  visitorId?: string | null;
  pass?: import('../services/visitorService').VisitorPass | null;
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
  credentialStatus?: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED' | 'PENDING_APPROVAL' | string | null;
  statusLabel?: string | null;
  qrMode?: string | null;
  qrExpiresAt?: string | null;
  qrRefreshIntervalSeconds?: number | null;
  serverTime?: string | null;
  lastValidatedAt?: string | null;
  staticFallbackPayload?: string | null;
  staticFallbackQrImageDataUri?: string | null;
  accessScope?: string | null;
  checkpointMarker?: string | null;
  credentialHistory?: string[] | null;
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
  category?: 'VISITOR' | 'SECURITY' | 'WORKFORCE' | 'SYSTEM' | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  title: string;
  message: string;
  visitorId?: string | null;
  visitorName?: string | null;
  actionUrl?: string | null;
  actorName?: string | null;
  organizationTimezone?: string | null;
  read: boolean;
  emailStatus?: string | null;
  createdAt?: string | null;
  source?: 'backend' | 'local';
};

export type NotificationInbox = {
  unreadCount: number;
  items: NotificationRecord[];
};

export type EmergencyIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EmergencyIncidentStatus = 'ACTIVE' | 'MONITORING' | 'RESOLVED';

export type EmergencyIncidentType =
  | 'LOCKDOWN_STARTED'
  | 'LOCKDOWN_CLEARED'
  | 'PANIC_TRIGGERED'
  | 'EMERGENCY_BROADCAST'
  | 'EVACUATION_STARTED'
  | 'SUSPICIOUS_VISITOR'
  | 'SUSPICIOUS_WORKFORCE'
  | 'OPERATIONAL_ESCALATION';

export type EmergencyState = {
  lockdownActive: boolean;
  lockdownReason?: string | null;
  lockdownScope?: string | null;
  lockdownInitiatedByName?: string | null;
  lockdownStartedAt?: string | null;
  approvalsSuspended: boolean;
  checkInsBlocked: boolean;
  evacuationActive: boolean;
  evacuationScope?: string | null;
  evacuationStartedAt?: string | null;
  latestBroadcastTitle?: string | null;
  latestBroadcastMessage?: string | null;
  latestBroadcastSeverity?: EmergencyIncidentSeverity | null;
  latestBroadcastAt?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  updatedAt?: string | null;
};

export type EmergencyIncident = {
  id: string;
  type: EmergencyIncidentType;
  severity: EmergencyIncidentSeverity;
  status: EmergencyIncidentStatus;
  title: string;
  message?: string | null;
  checkpoint?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  actorName?: string | null;
  notes?: string | null;
  repeatCount: number;
  createdAt?: string | null;
  resolvedAt?: string | null;
};

export type EmergencyEvacuationPerson = {
  id: string;
  personType: 'VISITOR' | 'WORKFORCE' | string;
  name: string;
  organizationName?: string | null;
  department?: string | null;
  lastKnownCheckpoint?: string | null;
  evacuationStatus: string;
  lastActivityAt?: string | null;
};

export type EmergencyEvacuationRegister = {
  generatedAt?: string | null;
  counts: Record<string, number>;
  visitorsInside: EmergencyEvacuationPerson[];
  workforceInside: EmergencyEvacuationPerson[];
  unaccounted: EmergencyEvacuationPerson[];
};

export type AdminOperationalReport = {
  title: string;
  status: string;
};

export type AnalyticsPoint = {
  label: string;
  value: number;
  note?: string | null;
  percentage?: number | null;
  [key: string]: unknown;
};

export type AnalyticsHeatmapRow = {
  label: string;
  date?: string | null;
  hours: AnalyticsPoint[];
};

export type OperationalInsight = {
  label: string;
  detail?: string | null;
  severity?: 'low' | 'medium' | 'high' | string | null;
};

export type AnalyticsSnapshot = {
  label: string;
  format?: string | null;
  records?: number | null;
  note?: string | null;
};

export type AdminOperationalAnalytics = {
  timezone?: string | null;
  metrics?: Record<string, number>;
  widgets?: AnalyticsPoint[];
  dailyVisitors?: AnalyticsPoint[];
  monthlyTrends?: AnalyticsPoint[];
  peakHours?: AnalyticsPoint[];
  visitorFlow?: AnalyticsPoint[];
  staffingInsights?: AnalyticsPoint[];
  approvalWorkload?: AnalyticsPoint[];
  checkInTrends?: AnalyticsPoint[];
  approvalRates?: AnalyticsPoint[];
  employeeAnalytics?: Record<string, unknown>[];
  trafficHeatmap?: AnalyticsHeatmapRow[];
  checkInHours?: AnalyticsPoint[];
  checkOutHours?: AnalyticsPoint[];
  workforceRushHours?: AnalyticsPoint[];
  weeklyPatterns?: AnalyticsPoint[];
  dailyPatterns?: AnalyticsPoint[];
  repeatVisitors?: AnalyticsPoint[];
  repeatOrganizations?: AnalyticsPoint[];
  repeatDeniedVisitors?: AnalyticsPoint[];
  denialTrends?: AnalyticsPoint[];
  denialReasons?: AnalyticsPoint[];
  denialAttempts?: AnalyticsPoint[];
  securityIncidents?: AnalyticsPoint[];
  incidentTrends?: AnalyticsPoint[];
  workforceAnomalies?: AnalyticsPoint[];
  liveOperations?: AnalyticsPoint[];
  organizationBreakdown?: AnalyticsPoint[];
  departmentBreakdown?: AnalyticsPoint[];
  visitorCategoryBreakdown?: AnalyticsPoint[];
  checkpointActivity?: AnalyticsPoint[];
  operationalInsights?: OperationalInsight[];
  exportSnapshots?: AnalyticsSnapshot[];
  workforceAttendance?: {
    timezone?: string | null;
    widgets?: AnalyticsPoint[];
    recentLogs?: EmployeeAttendanceRecord[];
  };
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

export type ApiVersionPayload = VersionHandshakePayload;
