import { useNavigation, useRoute, type NavigationProp, type ParamListBase, type RouteProp } from '@react-navigation/native';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { LegalDocument, type LegalDocumentType } from '../../components/legal/LegalDocument';
import { AppScreen } from '../../components/layout/AppScreen';

type LegalRouteParams = {
  Legal: {
    type?: LegalDocumentType;
  };
};

export function LegalScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute<RouteProp<LegalRouteParams, 'Legal'>>();
  const type = route.params?.type === 'terms' ? 'terms' : 'privacy';

  return (
    <AppScreen
      title={type === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
      subtitle="Readable mobile policy details for AccessFlow enterprise workspaces."
      contentMaxWidth={760}
    >
      <LegalDocument type={type} />
      <PrimaryButton label="Back" tone="secondary" onPress={() => navigation.goBack()} />
    </AppScreen>
  );
}
