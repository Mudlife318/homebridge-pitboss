import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { PitBossConfig } from './settings';
import { PitBossAccessory } from './accessory';
import { GrillClient } from './grillClient';
import { GrillDiscovery } from './discovery';
import { PollManager } from './pollManager';

export class PitBossPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly accessories: Map<string, PlatformAccessory> = new Map();
  private grillAccessory: PitBossAccessory | null = null;
  private client: GrillClient | null = null;
  private pollManager: PollManager | null = null;

  public readonly config: PitBossConfig;

  constructor(
    public readonly log: Logger,
    platformConfig: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.config = {
      platform:        platformConfig.platform,
      name:            platformConfig.name            ?? 'Pit Boss Smoker',
      grillIp:         platformConfig.grillIp,
      autoDiscover:    platformConfig.autoDiscover    ?? true,
      deviceId:        platformConfig.deviceId,
      pollInterval:    platformConfig.pollInterval    ?? 5000,
      sleepInterval:   platformConfig.sleepInterval   ?? 60000,
      sleepTimeout:    platformConfig.sleepTimeout    ?? 0,
      grillModel:      platformConfig.grillModel      ?? 'PBV4PS2',
      grillPassword:   platformConfig.grillPassword   ?? '',
      requestTimeout:  platformConfig.requestTimeout  ?? 8000,
    };

    this.log.info('[PitBoss] Plugin loaded. Waiting for Homebridge launch...');

    this.api.on('didFinishLaunching', () => this.initializePlatform());
    this.api.on('shutdown', () => this.pollManager?.stop());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`[PitBoss] Restoring cached accessory: ${accessory.displayName}`);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async initializePlatform(): Promise<void> {
    const ip = await this.resolveGrillIp();
    if (!ip) {
      this.log.error(
        '[PitBoss] Could not find grill. ' +
        'Either set grillIp manually in config, or ensure the grill is powered on and connected to WiFi.',
      );
      return;
    }

    this.log.info(`[PitBoss] Connecting to grill at ${ip}`);
    this.client = new GrillClient(ip, this.log, this.config.requestTimeout);

    // Register HomeKit accessory
    this.registerAccessory(ip);

    // Start smart poll manager
    this.pollManager = new PollManager(
      this.client,
      this.log,
      this.config.pollInterval,
      this.config.sleepInterval,
      this.config.sleepTimeout,
    );

    this.pollManager.onState((state) => {
      this.grillAccessory?.updateState(state);
    });

    this.pollManager.start();
  }

  private async resolveGrillIp(): Promise<string | null> {
    // Manual IP takes absolute priority
    if (this.config.grillIp) {
      this.log.info(`[PitBoss] Using manually configured IP: ${this.config.grillIp}`);
      return this.config.grillIp;
    }

    // Autodiscovery
    if (this.config.autoDiscover !== false) {
      const discovery = new GrillDiscovery(this.log, this.config.deviceId);
      const result = await discovery.discover();
      if (result) {
        this.log.info(
          `[PitBoss] Discovered grill: ${result.deviceId} @ ${result.ip} (via ${result.method})`,
        );
        return result.ip;
      }
    }

    return null;
  }

  private registerAccessory(grillIp: string): void {
    const uuid = this.api.hap.uuid.generate(`pitboss-${grillIp}`);
    const displayName = this.config.name;

    let platformAccessory = this.accessories.get(uuid);

    if (platformAccessory) {
      this.log.info(`[PitBoss] Reusing cached accessory: ${displayName}`);
    } else {
      this.log.info(`[PitBoss] Registering new accessory: ${displayName}`);
      platformAccessory = new this.api.platformAccessory(displayName, uuid);
      platformAccessory.context.grillIp = grillIp;
      platformAccessory.context.model = this.config.grillModel;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
      this.accessories.set(uuid, platformAccessory);
    }

    this.grillAccessory = new PitBossAccessory(this, platformAccessory, this.client!);
  }
}
