import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { recordFirebaseError } from '../runtime/firebaseRuntime';
import { recordOperationalMetric } from '../runtime/telemetry';
import { theme } from '../theme';
import { sanitizeUserFacingErrorMessage } from '../api/error';

type Props = {
  children: ReactNode;
  onRecoverShell?: () => Promise<void> | void;
  onSafeLogout?: () => Promise<void> | void;
};

type State = {
  hasError: boolean;
  message: string;
  incidentId: string;
  isRecovering: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
    incidentId: '',
    isRecovering: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: sanitizeUserFacingErrorMessage(error.message, 'runtime'),
      incidentId: `AF-${Date.now().toString(36).toUpperCase()}`,
      isRecovering: false,
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    void recordFirebaseError(error, 'UNHANDLED_RUNTIME_ERROR', {
      scope: 'runtime',
      incidentId: this.state.incidentId,
    });
    void recordDiagnosticEvent({
      level: 'error',
      scope: 'runtime',
      code: 'UNHANDLED_RUNTIME_ERROR',
      message: error.message || 'The mobile shell crashed unexpectedly.',
      context: {
        incidentId: this.state.incidentId,
        stack: info.componentStack?.slice(0, 180),
      },
    });
  }

  private handleReset = async () => {
    const incidentId = this.state.incidentId;
    this.setState((current) => ({
      ...current,
      isRecovering: true,
    }));

    try {
      await this.props.onRecoverShell?.();
      this.setState({
        hasError: false,
        message: '',
        incidentId: '',
        isRecovering: false,
      });
      await recordOperationalMetric({ name: 'runtime_recovery', tags: { source: 'error_boundary' } });
      await recordDiagnosticEvent({
        level: 'info',
        scope: 'runtime',
        code: 'RUNTIME_RECOVERED',
        message: 'Runtime recovered successfully after a guarded shell reset.',
        context: {
          incidentId,
        },
      });
    } catch (error) {
      this.setState((current) => ({
        ...current,
        message: error instanceof Error ? sanitizeUserFacingErrorMessage(error.message, 'runtime') : current.message,
        isRecovering: false,
      }));
    }
  };

  private handleSafeLogout = async () => {
    this.setState((current) => ({
      ...current,
      isRecovering: true,
    }));

    try {
      await this.props.onSafeLogout?.();
      this.setState({
        hasError: false,
        message: '',
        incidentId: '',
        isRecovering: false,
      });
    } catch {
      this.setState((current) => ({
        ...current,
        isRecovering: false,
      }));
    }
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>AccessFlow Recovery</Text>
          <Text style={styles.title}>The mobile runtime needs a clean restart.</Text>
          <Text style={styles.body}>
            {this.state.message || 'An unexpected error interrupted the operational workspace.'}
          </Text>
          {this.state.incidentId ? <Text style={styles.incident}>Incident: {this.state.incidentId}</Text> : null}
          <Pressable disabled={this.state.isRecovering} onPress={() => void this.handleReset()} style={styles.button}>
            <Text style={styles.buttonLabel}>{this.state.isRecovering ? 'Recovering…' : 'Retry app shell'}</Text>
          </Pressable>
          <Pressable disabled={this.state.isRecovering} onPress={() => void this.handleSafeLogout()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>Reset to sign-in</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.card,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title.fontSize,
    fontWeight: theme.typography.title.fontWeight,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  incident: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  button: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  buttonLabel: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
});
