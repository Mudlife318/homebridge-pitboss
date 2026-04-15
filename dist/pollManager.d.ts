import { Logger } from 'homebridge';
import { GrillClient } from './grillClient';
import { GrillState } from './types';
export type StateCallback = (state: Partial<GrillState>) => void;
type PollMode = 'active' | 'sleep';
export declare class PollManager {
    private readonly client;
    private readonly log;
    private timer;
    private mode;
    private sleepDebounceTimer;
    private consecutiveFailures;
    private readonly callbacks;
    private readonly pollInterval;
    private readonly sleepInterval;
    private readonly sleepTimeout;
    constructor(client: GrillClient, log: Logger, pollInterval?: number, sleepInterval?: number, sleepTimeout?: number);
    onState(cb: StateCallback): void;
    start(): void;
    stop(): void;
    get currentMode(): PollMode;
    private scheduleNext;
    private poll;
    private currentInterval;
    private notifyCallbacks;
    private updateMode;
    private enterSleep;
}
export {};
//# sourceMappingURL=pollManager.d.ts.map