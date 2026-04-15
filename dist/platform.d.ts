import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PitBossConfig } from './settings';
export declare class PitBossPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    private readonly accessories;
    private grillAccessory;
    private client;
    private pollManager;
    readonly config: PitBossConfig;
    constructor(log: Logger, platformConfig: PlatformConfig, api: API);
    configureAccessory(accessory: PlatformAccessory): void;
    private initializePlatform;
    private resolveGrillIp;
    private registerAccessory;
}
//# sourceMappingURL=platform.d.ts.map