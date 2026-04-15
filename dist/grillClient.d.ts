import { Logger } from 'homebridge';
import { GetStateResponse } from './types';
export declare class GrillClient {
    private readonly ip;
    private readonly timeout;
    private readonly log;
    constructor(ip: string, log: Logger, timeout?: number);
    getState(): Promise<GetStateResponse | null>;
    sendCommand(hexCmd: string): Promise<unknown>;
    probe(): Promise<string | null>;
    private get;
    private post;
    private request;
}
//# sourceMappingURL=grillClient.d.ts.map