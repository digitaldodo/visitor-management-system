import { registerRootComponent } from 'expo';

import App from './App';
import { registerAccessFlowFirebaseBackgroundHandlers } from './runtime/firebaseBackground';
import { initializeProductionObservability } from './runtime/observability';

registerAccessFlowFirebaseBackgroundHandlers();
void initializeProductionObservability();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
