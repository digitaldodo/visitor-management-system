import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { StatusPill } from '../../components/feedback/StatusPill';
import { useQrCheckInMutation, useVerifyQrMutation } from '../../hooks/useSecurityWorkspace';

export function ScanScreen() {
  const queryClient = useQueryClient();
  const [qrPayload, setQrPayload] = useState('');
  const verifyMutation = useVerifyQrMutation();
  const checkInMutation = useQrCheckInMutation();

  const verification = verifyMutation.data;
  const checkInResult = checkInMutation.data;

  const handleCheckIn = async () => {
    await checkInMutation.mutateAsync(qrPayload.trim());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'visitors'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
    ]);
  };

  return (
    <AppScreen
      title="Scan"
      subtitle="Optimized for fast checkpoint handling today, with camera and device scanner workflows ready to slot in next."
    >
      <SurfaceCard title="QR verification">
        <AppTextField
          label="QR payload"
          multiline
          helperText="Paste a badge payload while camera workflows are being wired in. The backend remains the source of truth for validation."
          onChangeText={setQrPayload}
          value={qrPayload}
        />
        <View style={styles.buttonGrid}>
          <PrimaryButton
            label="Verify pass"
            onPress={() => verifyMutation.mutate(qrPayload.trim())}
            loading={verifyMutation.isPending}
            disabled={!qrPayload.trim()}
          />
          <PrimaryButton
            label="Check in visitor"
            onPress={() => void handleCheckIn()}
            loading={checkInMutation.isPending}
            disabled={!qrPayload.trim()}
            tone="secondary"
          />
        </View>
      </SurfaceCard>

      {verification ? (
        <SurfaceCard title={verification.headline || 'Verification result'}>
          <StatusPill
            label={verification.statusLabel || (verification.valid ? 'Valid' : 'Blocked')}
            tone={verification.valid ? 'success' : 'danger'}
          />
          <Text>{verification.message || 'The backend returned the current pass status.'}</Text>
          {verification.fullName ? <Text>Visitor: {verification.fullName}</Text> : null}
          {verification.companyName ? <Text>Company: {verification.companyName}</Text> : null}
          {verification.recommendedAction ? <Text>Next step: {verification.recommendedAction}</Text> : null}
        </SurfaceCard>
      ) : null}

      {checkInResult ? (
        <SurfaceCard title="Check-in recorded" subtitle="The visitor list and monitoring surfaces will refresh automatically.">
          <Text>{checkInResult.fullName}</Text>
          <Text>{checkInResult.status}</Text>
        </SurfaceCard>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  buttonGrid: {
    gap: 12,
  },
});
