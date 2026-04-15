import { Logger } from 'homebridge';
import { GrillClient } from './grillClient';
import { parseGetStateResponse } from './grillProtocol';
import { GrillState } from './types';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_SLEEP_INTERVAL_MS,
  DEFAULT_SLEEP_TIMEOUT_MS,
} from './settings';

export type StateCallback = (state: Partial<GrillState>) => void;

type PollMode = 'active' | 'sleep';

/**
 * PollManager
 *
 * Manages polling the grill on a smart interval:
 *
 * ACTIVE mode  (grillIsOn = true):  polls every `pollInterval` ms (default 5s)
 * SLEEP mode   (grillIsOn = false): polls every `sleepInterval` ms (default 60s)
 *
 * Transitions:
 *   - active → sleep: after grill reports moduleIsOn=false for `sleepTimeout` ms
 *   - sleep  → active: immediately when grill reports moduleIsOn=true
 *
 * This dramatically reduces unnecessary network traffic when the smoker
 * is sitting cold between cooks.
 */
export class PollManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mode: PollMode = 'active';
  private sleepDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private readonly callbacks: StateCallback[] = [];

  private readonly pollInterval: number;
  private readonly sleepInterval: number;
  private readonly sleepTimeout: number;

  constructor(
    private readonly client: GrillClient,
    private readonly log: Logger,
    pollInterval = DEFAULT_POLL_INTERVAL_MS,
    sleepInterval = DEFAULT_SLEEP_INTERVAL_MS,
    sleepTimeout = DEFAULT_SLEEP_TIMEOUT_MS,
  ) {
    this.pollInterval = pollInterval;
    this.sleepInterval = sleepInterval;
    this.sleepTimeout = sleepTimeout;
  }

  /** Register a callback to receive state updates */
  onState(cb: StateCallback): void {
    this.callbacks.push(cb);
  }

  /** Start polling */
  start(): void {
    this.log.info(
      `[PollManager] Starting — active: ${this.pollInterval / 1000}s, ` +
      `sleep: ${this.sleepInterval / 1000}s, ` +
      `sleepTimeout: ${this.sleepTimeout / 1000}s`,
    );
    this.scheduleNext(0); // Immediate first poll
  }

  /** Stop polling */
  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.sleepDebounceTimer) { clearTimeout(this.sleepDebounceTimer); this.sleepDebounceTimer = null; }
  }

  /** Current polling mode */
  get currentMode(): PollMode { return this.mode; }

  // ─── Private ──────────────────────────────────────────────────────────────

  private scheduleNext(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    try {
      const resp = await this.client.getState();

      if (resp) {
        const state = parseGetStateResponse(resp);
        if (state) {
          this.consecutiveFailures = 0;
          this.notifyCallbacks(state);
          this.updateMode(state.moduleIsOn ?? false);
          this.scheduleNext(this.currentInterval());
          return;
        }
      }

      throw new Error('Empty or unparseable state response');

    } catch (err) {
      this.consecutiveFailures++;
      this.log.debug(`[PollManager] Poll failed (${this.consecutiveFailures}): ${err}`);
      // Back off slightly on consecutive failures, max 30s
      const backoff = Math.min(30000, this.currentInterval() * Math.min(this.consecutiveFailures, 3));
      this.scheduleNext(backoff);
    }
  }

  private currentInterval(): number {
    return this.mode === 'sleep' ? this.sleepInterval : this.pollInterval;
  }

  private notifyCallbacks(state: Partial<GrillState>): void {
    for (const cb of this.callbacks) {
      try { cb(state); } catch (err) {
        this.log.error(`[PollManager] State callback error: ${err}`);
      }
    }
  }

  private updateMode(grillIsOn: boolean): void {
    if (grillIsOn) {
      // Grill turned on — cancel any pending sleep transition and go active immediately
      if (this.sleepDebounceTimer) {
        clearTimeout(this.sleepDebounceTimer);
        this.sleepDebounceTimer = null;
      }
      if (this.mode !== 'active') {
        this.log.info('[PollManager] Grill ON — switching to active polling');
        this.mode = 'active';
      }
    } else {
      // Grill is off — start sleep transition debounce if not already pending
      if (this.mode === 'active' && !this.sleepDebounceTimer) {
        if (this.sleepTimeout === 0) {
          // Immediate sleep
          this.enterSleep();
        } else {
          this.log.debug(
            `[PollManager] Grill OFF — entering sleep in ${this.sleepTimeout / 1000}s`,
          );
          this.sleepDebounceTimer = setTimeout(() => {
            this.sleepDebounceTimer = null;
            this.enterSleep();
          }, this.sleepTimeout);
        }
      }
    }
  }

  private enterSleep(): void {
    if (this.mode !== 'sleep') {
      this.log.info(
        `[PollManager] Grill OFF — entering sleep mode (polling every ${this.sleepInterval / 1000}s)`,
      );
      this.mode = 'sleep';
    }
  }
}
