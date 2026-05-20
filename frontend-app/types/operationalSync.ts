export type OperationalEventCategory = 'visitor' | 'workforce' | 'approval' | 'incident' | 'audit' | 'runtime';
export type OperationalEventSeverity = 'info' | 'warning' | 'approval' | 'security' | 'emergency';

export type OperationalEvent = {
  id: string;
  type: string;
  category: OperationalEventCategory | string;
  severity: OperationalEventSeverity | string;
  organizationId?: string | null;
  organizationName?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  title: string;
  detail?: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
};

export type OperationalEventBatch = {
  cursor: string;
  serverTime: string;
  heartbeat: boolean;
  events: OperationalEvent[];
};

export type OperationalSyncConnectionState = {
  status: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'degraded';
  cursor: string | null;
  lastEventAt: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  reconnectAttempt: number;
  pendingEventCount: number;
};

export type OperationalReportExport = {
  exportId: string;
  reportType: string;
  format: 'CSV' | 'PDF' | string;
  title: string;
  organizationId?: string | null;
  organizationName?: string | null;
  generatedBy: string;
  generatedAt: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};
