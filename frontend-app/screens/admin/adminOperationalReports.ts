import type {
  AdminOperationalAnalytics,
  AnalyticsPoint,
  AnalyticsSnapshot,
  OperationalInsight,
} from '../../types/domain';

export function exportSnapshotsForAnalytics(data?: AdminOperationalAnalytics): AnalyticsSnapshot[] {
  if (data?.exportSnapshots?.length) {
    return data.exportSnapshots;
  }

  const metrics = data?.metrics ?? {};
  const workforceAnomalyCount = (data?.workforceAnomalies ?? []).reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const incidentCount = (data?.securityIncidents ?? []).reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const deniedCount = Number(metrics.rejectedVisitors ?? metrics.deniedEntries ?? 0);
  const activeVisitors = Number(metrics.activeVisitors ?? 0);

  return [
    {
      label: 'Visitor register',
      format: 'CSV',
      records: Number(metrics.totalVisitors ?? activeVisitors),
      note: 'Visitor exports with badge state, host, check-in, and check-out timestamps.',
    },
    {
      label: 'Denied entry report',
      format: 'CSV',
      records: deniedCount,
      note: 'Denied and rejected visitor entries for security review.',
    },
    {
      label: 'Incident log',
      format: 'CSV',
      records: incidentCount,
      note: 'Security incidents, suspicious activity, escalations, and overrides.',
    },
    {
      label: 'Workforce attendance',
      format: 'CSV',
      records: Number(data?.workforceAttendance?.metrics?.total ?? data?.workforceAnalytics?.total ?? workforceAnomalyCount),
      note: 'Attendance, shift, check-in, check-out, and manual override activity.',
    },
    {
      label: 'Operational snapshot',
      format: 'PDF',
      records: activeVisitors,
      note: 'Executive PDF summary of active visitors, workforce signals, incidents, and actions.',
    },
  ];
}

export function metricTone(item: AnalyticsPoint): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const label = String(item.label || '').toLowerCase();
  const value = Number(item.value) || 0;
  if (label.includes('denied') || label.includes('incident') || label.includes('overdue')) {
    return value > 0 ? 'danger' : 'default';
  }
  if (label.includes('pending') || label.includes('expir')) {
    return value > 0 ? 'warning' : 'default';
  }
  if (label.includes('inside') || label.includes('active')) {
    return value > 0 ? 'success' : 'default';
  }
  return 'info';
}

export function severityTone(severity?: string | null): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const value = String(severity || '').toLowerCase();
  if (value === 'high') {
    return 'danger';
  }
  if (value === 'medium') {
    return 'warning';
  }
  if (value === 'low') {
    return 'info';
  }
  return 'default';
}

export function formatMetricValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return String(value ?? 0);
}

export function operationalReportCsv(snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) {
  const rows = [
    ['Report', 'Section', 'Label', 'Value', 'Detail'],
    ...snapshotRows(snapshot, payload),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function operationalReportHtml(snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) {
  const live = (payload?.liveOperations ?? []).map((item) => (
    `<article><span>${escapeReport(item.label)}</span><strong>${escapeReport(item.value)}</strong><small>${escapeReport(item.note || '')}</small></article>`
  )).join('');
  const insights = (payload?.operationalInsights ?? []).map((item) => (
    `<li><strong>${escapeReport(item.label)}</strong> ${escapeReport(item.detail || '')}</li>`
  )).join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:28px;background:#071120;color:#F8FAFC}h1{margin:0 0 8px}p{color:#94A3B8}section{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:22px 0}article{background:#0A1628;border:1px solid rgba(79,140,255,0.28);border-radius:10px;padding:12px}span,small{display:block;color:#94A3B8;font-size:11px;text-transform:uppercase}strong{display:block;font-size:24px;margin:8px 0}</style></head><body><h1>${escapeReport(snapshot.label)}</h1><p>${escapeReport(snapshot.note || 'AccessFlow operational snapshot')}</p><section>${live}</section><h2>Actionable insights</h2><ul>${insights}</ul></body></html>`;
}

export function slugify(value?: string | null) {
  const slug = String(value || 'operational-snapshot').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
  return slug || 'operational-snapshot';
}

export function reportTypeForSnapshot(snapshot: AnalyticsSnapshot) {
  const label = String(snapshot.label || '').toLowerCase();
  if (label.includes('incident')) {
    return 'incident-report';
  }
  if (label.includes('denied') || label.includes('reject')) {
    return 'denied-entry-report';
  }
  if (label.includes('workforce') || label.includes('attendance')) {
    return 'workforce-activity';
  }
  if (label.includes('audit')) {
    return 'operational-audit-log';
  }
  if (label.includes('checkpoint')) {
    return 'checkpoint-activity';
  }
  return 'visitor-register';
}

function snapshotRows(snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) {
  const sections: [string, (AnalyticsPoint | OperationalInsight)[] | undefined][] = [
    ['Current operations', payload?.liveOperations],
    ['Repeat visitors', payload?.repeatVisitors],
    ['Denied reasons', payload?.denialReasons],
    ['Security incidents', payload?.securityIncidents],
    ['Workforce anomalies', payload?.workforceAnomalies],
    ['Checkpoint activity', payload?.checkpointActivity],
    ['Insights', payload?.operationalInsights],
  ];
  return sections.flatMap(([section, items]) => (items ?? []).map((item) => [
    snapshot.label,
    section,
    String((item as AnalyticsPoint).label || (item as OperationalInsight).label || ''),
    String((item as AnalyticsPoint).value ?? (item as OperationalInsight).severity ?? ''),
    String((item as AnalyticsPoint).note || (item as AnalyticsPoint).detail || (item as OperationalInsight).detail || ''),
  ]));
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function escapeReport(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
