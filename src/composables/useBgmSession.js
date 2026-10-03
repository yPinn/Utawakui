import { reactive } from 'vue';
import { useLibrary } from './useLibrary.js';
import { useObsIntegration } from './useObsIntegration.js';
import { usePlayer } from './usePlayer.js';
import { useBgmStandbyPlan } from './useBgmStandbyPlan.js';
import { createBgmAudioDeck } from '../bgm/audioDeck.js';
import { createBgmHandoffCoordinator } from '../bgm/handoffCoordinator.js';
import { createBgmSessionController } from '../bgm/sessionController.js';
import { createBgmSessionModeProjector } from '../bgm/sessionMode.js';

const plan = useBgmStandbyPlan();
const library = useLibrary();
const obs = useObsIntegration();
const player = usePlayer();
const deckState = reactive({});
const handoffState = reactive({});
const deck = createBgmAudioDeck({ state: deckState });
const coordinator = createBgmHandoffCoordinator({
  deck,
  state: handoffState,
  getSettings: () => plan.state.plan.settings,
});
const controller = createBgmSessionController({
  plan,
  library,
  obs,
  player,
  deck,
  coordinator,
  projector: createBgmSessionModeProjector(),
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => controller.dispose());
}

export function useBgmSession() {
  return controller;
}
