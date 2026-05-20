import { useDeferredValue, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useCreateWorkforceOnboardingMutation,
  useManualEmployeeCheckInMutation,
  useManualEmployeeCheckOutMutation,
  useSecurityAttendance,
  useSecurityEmployees,
  useUploadWorkforcePhotoMutation,
} from '../../hooks/useSecurityWorkspace';
import { theme } from '../../theme';
import type { EmployeeAttendanceRecord, EmployeeDirectoryEntry } from '../../types/domain';
import { employeePresenceLabel, formatDateTime, relativePresenceSummary, statusTone } from '../../utils/securityFormatting';

type WorkforceAction =
  | { type: 'check-in'; employee: EmployeeDirectoryEntry }
  | { type: 'check-out'; employee: EmployeeDirectoryEntry };

const WORKER_TYPES = [
  { label: 'Support', value: 'SUPPORT_STAFF' },
  { label: 'Cleaner', value: 'CLEANER' },
  { label: 'Gardener', value: 'GARDENER' },
  { label: 'Contract', value: 'CONTRACT_LABOR' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
];

export function WorkforceScreen() {
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [workforceAction, setWorkforceAction] = useState<WorkforceAction | null>(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [workerPhoto, setWorkerPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [employeeType, setEmployeeType] = useState('SUPPORT_STAFF');
  const [shiftName, setShiftName] = useState('General Shift');
  const [shiftStartTime, setShiftStartTime] = useState('09:00');
  const [shiftEndTime, setShiftEndTime] = useState('18:00');
  const [formError, setFormError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search.trim());
  const attendance = useSecurityAttendance();
  const employees = useSecurityEmployees(deferredSearch);

  const createWorkforceMutation = useCreateWorkforceOnboardingMutation();
  const uploadWorkforcePhotoMutation = useUploadWorkforcePhotoMutation();
  const manualCheckInMutation = useManualEmployeeCheckInMutation();
  const manualCheckOutMutation = useManualEmployeeCheckOutMutation();

  const recentPresenceByEmployee = useMemo(() => {
    const map = new Map<string, EmployeeAttendanceRecord>();
    (attendance.data ?? []).forEach((entry) => {
      if (!map.has(entry.employeeUserId)) {
        map.set(entry.employeeUserId, entry);
      }
    });
    return map;
  }, [attendance.data]);

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'employees'] }),
    ]);
  };

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setEmail('');
    setDepartment('');
    setPhoneCountryCode('+1');
    setPhone('');
    setDesignation('');
    setEmployeeType('SUPPORT_STAFF');
    setShiftName('General Shift');
    setShiftStartTime('09:00');
    setShiftEndTime('18:00');
    setWorkerPhoto(null);
    setFormError(null);
  };

  const submitOnboarding = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError('Enter the worker name.');
      return;
    }
    if (!phone.trim()) {
      setFormError('Enter a phone number for the worker.');
      return;
    }
    if (!designation.trim()) {
      setFormError('Enter the worker role or designation.');
      return;
    }

    setFormError(null);

    let employeePhotoUrl: string | null = null;
    if (workerPhoto) {
      const photo = await uploadWorkforcePhotoMutation.mutateAsync(workerPhoto);
      employeePhotoUrl = photo.url;
    }

    const worker = await createWorkforceMutation.mutateAsync({
      fullName: fullName.trim(),
      username: username.trim() || null,
      email: email.trim() || null,
      department: department.trim() || null,
      phoneCountryCode: phoneCountryCode.trim() || null,
      phone: phone.trim(),
      designation: designation.trim(),
      employeeType,
      employeePhotoUrl,
      shiftName: shiftName.trim() || null,
      shiftStartTime: shiftStartTime.trim() || null,
      shiftEndTime: shiftEndTime.trim() || null,
    });

    setActionMessage(`${worker.fullName} queued for admin approval. Security-assisted onboarding is recorded and access stays inactive until approval.`);
    resetForm();
    await refreshWorkspace();
  };

  const executeWorkforceAction = async (reason: string) => {
    if (!workforceAction) {
      return;
    }

    if (workforceAction.type === 'check-in') {
      const record = await manualCheckInMutation.mutateAsync({ employeeId: workforceAction.employee.id, reason });
      setActionMessage(`${record.employeeName} checked in with security assistance.`);
    } else {
      const record = await manualCheckOutMutation.mutateAsync({ employeeId: workforceAction.employee.id, reason });
      setActionMessage(`${record.employeeName} checked out with security assistance.`);
    }

    setWorkforceAction(null);
    await refreshWorkspace();
  };

  const reasonConfig = workforceAction
    ? workforceAction.type === 'check-in'
      ? {
          title: 'Manual worker check-in',
          helperText: 'Record why security had to assist instead of using the static workforce QR.',
          confirmLabel: 'Check in',
        }
      : {
          title: 'Manual worker check-out',
          helperText: 'Record why security had to assist instead of using the static workforce QR.',
          confirmLabel: 'Check out',
        }
    : null;

  return (
    <>
      <AppScreen
        title="Workforce Operations"
        subtitle="Security-led workforce verification, presence visibility, and assisted onboarding for support teams."
        refreshing={attendance.isRefetching || employees.isRefetching}
        onRefresh={() => Promise.all([attendance.refetch(), employees.refetch()])}
      >
        <SurfaceCard title="Assisted onboarding" subtitle="Capture the worker identity, service type, and shift context for admin approval.">
          <AppTextField label="Worker name" value={fullName} onChangeText={setFullName} placeholder="Full name" />
          <AppTextField label="Username (optional)" value={username} onChangeText={setUsername} placeholder="worker_001" autoCapitalize="none" />
          <AppTextField label="Email (optional)" value={email} onChangeText={setEmail} placeholder="worker@accessflow.local" autoCapitalize="none" keyboardType="email-address" />
          <AppTextField label="Department" value={department} onChangeText={setDepartment} placeholder="Facility support, landscaping, housekeeping" />
          <InternationalPhoneInput
            countryCode={phoneCountryCode}
            phone={phone}
            onCountryCodeChange={setPhoneCountryCode}
            onPhoneChange={setPhone}
          />
          <AppTextField label="Designation" value={designation} onChangeText={setDesignation} placeholder="Cleaner, gardener, electrician, support staff" />

          <View style={styles.segmentRow}>
            {WORKER_TYPES.map((type) => (
              <Pressable
                key={type.value}
                onPress={() => setEmployeeType(type.value)}
                style={[styles.segment, employeeType === type.value ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentLabel, employeeType === type.value ? styles.segmentLabelActive : null]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.inlineFields, layout.fieldStacked ? styles.inlineFieldsStacked : null]}>
            <View style={styles.inlineFieldWide}>
              <AppTextField label="Shift name" value={shiftName} onChangeText={setShiftName} placeholder="General Shift" />
            </View>
            <View style={[styles.inlineField, layout.fieldStacked ? styles.inlineFieldStacked : null]}>
              <AppTextField label="Start" value={shiftStartTime} onChangeText={setShiftStartTime} placeholder="09:00" />
            </View>
            <View style={[styles.inlineField, layout.fieldStacked ? styles.inlineFieldStacked : null]}>
              <AppTextField label="End" value={shiftEndTime} onChangeText={setShiftEndTime} placeholder="18:00" />
            </View>
          </View>

          <View style={[styles.photoRow, layout.fieldStacked ? styles.photoRowStacked : null]}>
            {workerPhoto ? <Image source={{ uri: workerPhoto.uri }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoPlaceholderText}>Photo optional</Text></View>}
            <View style={styles.photoMeta}>
              <Text style={styles.photoTitle}>Worker photo</Text>
              <Text style={styles.helperText}>Capture a reference image if security needs a visual identity on file for later verification.</Text>
              <PrimaryButton label={workerPhoto ? 'Retake photo' : 'Capture photo'} onPress={() => setPhotoModalVisible(true)} tone="secondary" />
            </View>
          </View>

          <OperationalFieldList
            items={[
              { label: 'Approval flow', value: 'Admin approval required before activation' },
              { label: 'QR access', value: 'Issued only after admin approval' },
              { label: 'Use case', value: 'Support staff, contractors, maintenance, landscaping' },
            ]}
          />

          {formError ? (
            <View style={styles.errorState}>
              <StatusPill label="Check details" tone="danger" />
              <Text style={styles.bodyText}>{formError}</Text>
            </View>
          ) : null}

          <PrimaryButton
            label="Submit onboarding request"
            onPress={() => void submitOnboarding()}
            loading={createWorkforceMutation.isPending || uploadWorkforcePhotoMutation.isPending}
          />
        </SurfaceCard>

        <SurfaceCard title="Workforce search" subtitle="Look up cleaners, gardeners, support staff, contract labor, and active employees from the backend directory.">
          <AppTextField label="Search workforce" value={search} onChangeText={setSearch} placeholder="Search by name, employee ID, designation, or department" />
          {employees.data?.length ? (
            employees.data.slice(0, 10).map((employee) => {
              const recent = recentPresenceByEmployee.get(employee.id);
              return (
                <View key={employee.id} style={styles.directoryCard}>
                  <RecordCard
                    title={employee.fullName}
                    subtitle={[employee.department, employee.designation].filter(Boolean).join(' · ')}
                    meta={[
                      employee.employeeId ? `ID: ${employee.employeeId}` : null,
                      employee.employeeType ? employee.employeeType.replaceAll('_', ' ') : null,
                      employee.shiftName ? `Shift: ${employee.shiftName}` : null,
                    ].filter(Boolean).join(' · ')}
                    status={employee.currentlyIn ? 'Inside' : employee.accountStatus || 'Available'}
                    tone={employee.currentlyIn ? 'success' : statusTone(employee.accountStatus)}
                  />
                  <OperationalFieldList
                    items={[
                      { label: 'Organization', value: employee.organizationName || employee.organizationCode || 'Assigned' },
                      { label: 'Presence', value: employeePresenceLabel(recent || employee) },
                      { label: 'Recent log', value: relativePresenceSummary(recent) },
                      { label: 'Access state', value: employee.accountStatus || (employee.active ? 'ACTIVE' : 'INACTIVE') },
                    ]}
                  />
                  <View style={styles.actionRow}>
                    <PrimaryButton
                      label={employee.currentlyIn ? 'Assist check-out' : 'Assist check-in'}
                      onPress={() => setWorkforceAction({ type: employee.currentlyIn ? 'check-out' : 'check-in', employee })}
                      tone="secondary"
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState title="No workforce matches" body="Search results will appear here when the backend directory returns security-visible workers." />
          )}
        </SurfaceCard>

        <SurfaceCard title="Presence logs" subtitle="Recent security-visible workforce access events only.">
          {attendance.data?.length ? (
            attendance.data.slice(0, 10).map((entry) => (
              <RecordCard
                key={entry.id}
                title={entry.employeeName}
                subtitle={[entry.department, entry.designation].filter(Boolean).join(' · ')}
                meta={[
                  entry.lastAction ? `Action: ${entry.lastAction.replaceAll('_', ' ')}` : null,
                  entry.checkInTime ? `Check-in: ${formatDateTime(entry.checkInTime)}` : null,
                  entry.checkOutTime ? `Check-out: ${formatDateTime(entry.checkOutTime)}` : null,
                ].filter(Boolean).join(' · ')}
                status={employeePresenceLabel(entry)}
                tone={statusTone(entry.status)}
              />
            ))
          ) : (
            <EmptyState title="No presence logs yet" body="Security-controlled check-ins and check-outs will appear here." />
          )}
        </SurfaceCard>

        {actionMessage ? (
          <SurfaceCard title="Operational update">
            <StatusPill label="Recorded" tone="success" />
            <Text style={styles.bodyText}>{actionMessage}</Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <PhotoCaptureModal
        visible={photoModalVisible}
        title="Capture worker photo"
        onCancel={() => setPhotoModalVisible(false)}
        onCapture={(asset) => {
          setWorkerPhoto(asset);
          setPhotoModalVisible(false);
        }}
      />

      {reasonConfig ? (
        <ReasonCaptureModal
          visible={Boolean(workforceAction)}
          title={reasonConfig.title}
          helperText={reasonConfig.helperText}
          confirmLabel={reasonConfig.confirmLabel}
          loading={manualCheckInMutation.isPending || manualCheckOutMutation.isPending}
          onCancel={() => setWorkforceAction(null)}
          onConfirm={executeWorkforceAction}
          minLength={4}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  inlineFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineFieldsStacked: {
    flexDirection: 'column',
  },
  inlineField: {
    width: 96,
  },
  inlineFieldStacked: {
    width: '100%',
  },
  inlineFieldWide: {
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  segment: {
    minHeight: 44,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  segmentLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
  },
  photoRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  photoRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  photoPreview: {
    width: 104,
    height: 104,
    borderRadius: 20,
  },
  photoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  photoPlaceholderText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  photoMeta: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  photoTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  errorState: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  directoryCard: {
    gap: theme.spacing.md,
  },
  actionRow: {
    gap: theme.spacing.sm,
  },
});
