"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollManager = void 0;
const grillProtocol_1 = require("./grillProtocol");
const settings_1 = require("./settings");
class PollManager {
    constructor(client, log, pollInterval = settings_1.DEFAULT_POLL_INTERVAL_MS, sleepInterval = settings_1.DEFAULT_SLEEP_INTERVAL_MS, sleepTimeout = settings_1.DEFAULT_SLEEP_TIMEOUT_MS) {
        this.client = client;
        this.log = log;
        this.timer = null;
        this.mode = 'active';
        this.sleepDebounceTimer = null;
        this.consecutiveFailures = 0;
        this.callbacks = [];
        this.pollInterval = pollInterval;
        this.sleepInterval = sleepInterval;
        this.sleepTimeout = sleepTimeout;
    }
    onState(cb) {
        this.callbacks.push(cb);
    }
    start() {
        this.log.info(`[PollManager] Starting — active: ${this.pollInterval / 1000}s, ` +
            `sleep: ${this.sleepInterval / 1000}s, ` +
            `sleepTimeout: ${this.sleepTimeout / 1000}s`);
        this.scheduleNext(0);
    }
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.sleepDebounceTimer) {
            clearTimeout(this.sleepDebounceTimer);
            this.sleepDebounceTimer = null;
        }
    }
    get currentMode() { return this.mode; }
    scheduleNext(delayMs) {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => this.poll(), delayMs);
    }
    async poll() {
        try {
            const resp = await this.client.getState();
            if (resp) {
                const state = (0, grillProtocol_1.parseGetStateResponse)(resp);
                if (state) {
                    this.consecutiveFailures = 0;
                    this.notifyCallbacks(state);
                    this.updateMode(state.moduleIsOn ?? false);
                    this.scheduleNext(this.currentInterval());
                    return;
                }
            }
            throw new Error('Empty or unparseable state response');
        }
        catch (err) {
            this.consecutiveFailures++;
            this.log.debug(`[PollManager] Poll failed (${this.consecutiveFailures}): ${err}`);
            const backoff = Math.min(30000, this.currentInterval() * Math.min(this.consecutiveFailures, 3));
            this.scheduleNext(backoff);
        }
    }
    currentInterval() {
        return this.mode === 'sleep' ? this.sleepInterval : this.pollInterval;
    }
    notifyCallbacks(state) {
        for (const cb of this.callbacks) {
            try {
                cb(state);
            }
            catch (err) {
                this.log.error(`[PollManager] State callback error: ${err}`);
            }
        }
    }
    updateMode(grillIsOn) {
        if (grillIsOn) {
            if (this.sleepDebounceTimer) {
                clearTimeout(this.sleepDebounceTimer);
                this.sleepDebounceTimer = null;
            }
            if (this.mode !== 'active') {
                this.log.info('[PollManager] Grill ON — switching to active polling');
                this.mode = 'active';
            }
        }
        else {
            if (this.mode === 'active' && !this.sleepDebounceTimer) {
                if (this.sleepTimeout === 0) {
                    this.enterSleep();
                }
                else {
                    this.log.debug(`[PollManager] Grill OFF — entering sleep in ${this.sleepTimeout / 1000}s`);
                    this.sleepDebounceTimer = setTimeout(() => {
                        this.sleepDebounceTimer = null;
                        this.enterSleep();
                    }, this.sleepTimeout);
                }
            }
        }
    }
    enterSleep() {
        if (this.mode !== 'sleep') {
            this.log.info(`[PollManager] Grill OFF — entering sleep mode (polling every ${this.sleepInterval / 1000}s)`);
            this.mode = 'sleep';
        }
    }
}
exports.PollManager = PollManager;
//# sourceMappingURL=pollManager.js.map