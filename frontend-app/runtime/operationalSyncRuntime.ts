import { AppState, type AppStateStatus } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import { getOperationalEvents } from '../services/operationalEventService';
import { recordSyncFailure } from './observability';
import type {
  OperationalEvent,
  OperationalEventBatch,
  OperationalSyncConnectionState,
} from '../types/operationalSync';

type EventListener = (events: OperationalEvent[], batch: OperationalEventBatch) => void;
type StateListener = (state: OperationalSyncConnectionState) => void;

const MAX_SEEN_IDS = 400;
const LIVE_IDLE_DELAY_MS = 4_000;
const MAX_RECONNECT_DELAY_MS = 45_000;

const initialState: OperationalSyncConnectionState = {
  status: 'idle',
  cursor: null,
  lastEventAt: null,
  lastConnectedAt: null,
  lastError: null,
  reconnectAttempt: 0,
  pendingEventCount: 0,
};

class OperationalSyncRuntime {
  private state: OperationalSyncConnectionState = initialState;
  private eventListeners = new Set<EventListener>();
  private stateListeners = new Set<StateListener>();
  private seenEventIds: string[] = [];
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private appState: AppStateStatus = AppState.currentState;

  subscribe(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  subscribeState(listener: StateListener) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  start(cursor?: string | null) {
    if (cursor && cursor !== this.state.cursor) {
      this.setState({ cursor });
    }
    if (this.active) {
      return;
    }
    this.active = true;
    this.setState({ status: 'connecting', lastError: null });
    this.schedule(0);
  }

  stop() {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.inflight = null;
    this.seenEventIds = [];
    this.setState(initialState);
  }

  pause() {
    if (!this.active) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setState({ status: 'idle' });
  }

  resume() {
    if (!this.active) {
      return;
    }
    this.setState({ status: this.state.reconnectAttempt ? 'reconnecting' : 'connecting', lastError: null });
    this.schedule(0);
  }

  markOffline() {
    if (!this.active) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setState({ status: 'offline' });
  }

  setAppState(nextState: AppStateStatus) {
    this.appState = nextState;
    if (!this.active) {
      return;
    }
    if (nextState === 'active') {
      this.resume();
      return;
    }
    this.pause();
  }

  syncNow() {
    if (!this.active) {
      return Promise.resolve();
    }
    return this.poll();
  }

  private schedule(delayMs: number) {
    if (!this.active || this.appState !== 'active') {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.poll();
    }, Math.max(0, delayMs));
  }

  private async poll() {
    if (!this.active || this.appState !== 'active') {
      return;
    }
    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = (async () => {
      try {
        const batch = await getOperationalEvents(this.state.cursor, apiConfig.sync.eventBatchSize);
        const events = this.dedupe(batch.events ?? []);
        const lastEvent = events.at(-1);
        this.setState({
          status: 'live',
          cursor: batch.cursor || this.state.cursor,
          lastConnectedAt: new Date().toISOString(),
          lastEventAt: lastEvent?.occurredAt ?? this.state.lastEventAt,
          lastError: null,
          reconnectAttempt: 0,
          pendingEventCount: events.length,
        });
        if (events.length) {
          this.eventListeners.forEach((listener) => listener(events, batch));
        }
        this.schedule(events.length ? 650 : LIVE_IDLE_DELAY_MS);
      } catch (error) {
        const reconnectAttempt = this.state.reconnectAttempt + 1;
        this.setState({
          status: reconnectAttempt > 2 ? 'degraded' : 'reconnecting',
          lastError: error instanceof Error ? error.message : 'Operational sync failed.',
          reconnectAttempt,
        });
        void recordSyncFailure({
          code: 'RUNTIME_SYNC_POLL_FAILED',
          message: error instanceof Error ? error.message : 'Operational sync failed.',
          reconnectAttempt,
          status: reconnectAttempt > 2 ? 'degraded' : 'reconnecting',
        });
        this.schedule(Math.min(MAX_RECONNECT_DELAY_MS, 1_000 * 2 ** Math.min(reconnectAttempt, 5)));
      } finally {
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  private dedupe(events: OperationalEvent[]) {
    const nextEvents = events.filter((event) => {
      if (!event.id || this.seenEventIds.includes(event.id)) {
        return false;
      }
      this.seenEventIds.push(event.id);
      return true;
    });
    if (this.seenEventIds.length > MAX_SEEN_IDS) {
      this.seenEventIds = this.seenEventIds.slice(-MAX_SEEN_IDS);
    }
    return nextEvents.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  }

  private setState(patch: Partial<OperationalSyncConnectionState>) {
    this.state = { ...this.state, ...patch };
    this.stateListeners.forEach((listener) => listener(this.state));
  }
}

export const operationalSyncRuntime = new OperationalSyncRuntime();
