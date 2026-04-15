import { Logger } from 'homebridge';
import { DiscoveryResult } from './types';
export declare class GrillDiscovery {
    private readonly log;
    private readonly deviceId?;
    constructor(log: Logger, deviceId?: string | undefined);
    discover(): Promise<DiscoveryResult | null>;
    private discoverViaMdns;
    private discoverViaScan;
    private scanSubnet;
    private probeHost;
    private fetchConf9;
    private getLocalSubnets;
}
//# sourceMappingURL=discovery.d.ts.map