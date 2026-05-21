import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { DetailRow } from '../employee/DetailRow';
import { StatusPill } from '../feedback/StatusPill';
import { theme } from '../../theme';

export type LegalDocumentType = 'privacy' | 'terms';

const privacySections = [
  {
    title: 'Data AccessFlow processes',
    body: 'AccessFlow stores account identity, organization role, visitor records, badge state, operational audit events, session metadata, and notification delivery metadata required to run access-control workflows.',
  },
  {
    title: 'Operational purpose',
    body: 'Information is used for visitor verification, QR access, approvals, incident response, workforce presence, offline sync reconciliation, and security auditability.',
  },
  {
    title: 'Device permissions',
    body: 'Camera, notifications, and selected photos/files are requested only when a workflow needs them. Audio recording and unrelated background file access are not part of the mobile permission scope.',
  },
  {
    title: 'Security controls',
    body: 'Sessions use encrypted secure storage, refresh-token validation, revocation support, and role-scoped API access. Offline records are bounded to operational use and sync back for backend validation.',
  },
  {
    title: 'Retention and support',
    body: 'Organizations control retention, exports, user access, and deletion requests through their administrative policies. Operators should contact their organization administrator for account or data requests.',
  },
];

const termsSections = [
  {
    title: 'Authorized use',
    body: 'AccessFlow Mobile is for approved visitor, workforce, security, and administrative operations within an authorized organization workspace.',
  },
  {
    title: 'Credential responsibility',
    body: 'Users must protect account credentials, badges, QR passes, and organization devices. Shared operational devices should follow administrator policy.',
  },
  {
    title: 'Security operations',
    body: 'Scanner decisions, manual overrides, approvals, denials, incidents, and offline actions are operational records and may be audited by authorized organization personnel.',
  },
  {
    title: 'Connectivity and offline mode',
    body: 'Offline mode is provisional. Access decisions made from cached data must be reconciled when sync returns and should follow local security policy.',
  },
  {
    title: 'Changes and availability',
    body: 'Mobile features, runtime policy, and backend availability can change as the organization updates AccessFlow or its operational rules.',
  },
];

export function LegalDocument({ type, embedded }: { type: LegalDocumentType; embedded?: boolean }) {
  const isPrivacy = type === 'privacy';
  const sections = isPrivacy ? privacySections : termsSections;

  return (
    <View style={styles.stack}>
      <View style={[styles.hero, embedded ? styles.heroEmbedded : null]}>
        <View style={styles.iconWrap}>
          <Ionicons name={isPrivacy ? 'lock-closed-outline' : 'document-text-outline'} size={25} color={theme.colors.info} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}</Text>
          <Text style={styles.body}>
            {isPrivacy
              ? 'Enterprise-ready privacy summary for AccessFlow Mobile operational workspaces.'
              : 'Professional usage terms for secure mobile access workflows.'}
          </Text>
          <StatusPill label="Mobile policy" tone="info" />
        </View>
      </View>

      <View style={[styles.metaCard, embedded ? styles.sectionEmbedded : null]}>
        <DetailRow label="Product" value="AccessFlow Mobile" />
        <DetailRow label="Audience" value="Visitors, employees, security teams, and administrators" />
        <DetailRow label="Last updated" value="May 20, 2026" />
      </View>

      {sections.map((section) => (
        <View key={section.title} style={[styles.section, embedded ? styles.sectionEmbedded : null]}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}

      <View style={styles.notice}>
        <Ionicons name="business-outline" size={18} color={theme.colors.warning} />
        <Text style={styles.noticeText}>
          This in-app policy is a mobile presentation layer for store readiness and user education. Organizations should publish their legally reviewed external policy URLs before Play Store submission.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing.md,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
  },
  heroEmbedded: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
  },
  heroCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  metaCard: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  section: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
  sectionEmbedded: {
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  sectionBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.28)',
    backgroundColor: theme.colors.warningSoft,
    padding: theme.spacing.md,
  },
  noticeText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
});
