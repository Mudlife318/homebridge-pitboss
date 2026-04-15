import { PlatformAccessory } from 'homebridge';
import { PitBossPlatform } from './platform';
import { GrillClient } from './grillClient';
import { GrillState } from './types';
export declare class PitBossAccessory {
    private readonly accessory;
    private readonly client;
    private readonly hap;
    private readonly log;
    private readonly thermostatService;
    private readonly probe1Service;
    private readonly probe2Service;
    private readonly occupancyService;
    private readonly pelletsService;
    private readonly shutdownService;
    private readonly primerService;
    private cachedState;
    constructor(platform: PitBossPlatform, accessory: PlatformAccessory, client: GrillClient);
    updateState(state: Partial<GrillState>): void;
}
//# sourceMappingURL=accessory.d.ts.map