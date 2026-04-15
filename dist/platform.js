"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PitBossPlatform = void 0;
const settings_1 = require("./settings");
const accessory_1 = require("./accessory");
const grillClient_1 = require("./grillClient");
const discovery_1 = require("./discovery");
const pollManager_1 = require("./pollManager");
class PitBossPlatform {
    constructor(log, platformConfig, api) {
        this.log = log;
        this.api = api;
        this.accessories = new Map();
        this.grillAccessory = null;
        this.client = null;
        this.pollManager = null;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.config = {
            platform: platformConfig.platform,
            name: platformConfig.name ?? 'Pit Boss Smoker',
            grillIp: platformConfig.grillIp,
            autoDiscover: platformConfig.autoDiscover ?? true,
            deviceId: platformConfig.deviceId,
            pollInterval: platformConfig.pollInterval ?? 5000,
            sleepInterval: platformConfig.sleepInterval ?? 60000,
            sleepTimeout: platformConfig.sleepTimeout ?? 0,
            grillModel: platformConfig.grillModel ?? 'PBV4PS2',
            grillPassword: platformConfig.grillPassword ?? '',
            requestTimeout: platformConfig.requestTimeout ?? 8000,
        };
        this.log.info('[PitBoss] Plugin loaded. Waiting for Homebridge launch...');
        this.api.on('didFinishLaunching', () => this.initializePlatform());
        this.api.on('shutdown', () => this.pollManager?.stop());
    }
    configureAccessory(accessory) {
        this.log.info(`[PitBoss] Restoring cached accessory: ${accessory.displayName}`);
        this.accessories.set(accessory.UUID, accessory);
    }
    async initializePlatform() {
        const ip = await this.resolveGrillIp();
        if (!ip) {
            this.log.error('[PitBoss] Could not find grill. ' +
                'Either set grillIp manually in config, or ensure the grill is powered on and connected to WiFi.');
            return;
        }
        this.log.info(`[PitBoss] Connecting to grill at ${ip}`);
        this.client = new grillClient_1.GrillClient(ip, this.log, this.config.requestTimeout);
        this.registerAccessory(ip);
        this.pollManager = new pollManager_1.PollManager(this.client, this.log, this.config.pollInterval, this.config.sleepInterval, this.config.sleepTimeout);
        this.pollManager.onState((state) => {
            this.grillAccessory?.updateState(state);
        });
        this.pollManager.start();
    }
    async resolveGrillIp() {
        if (this.config.grillIp) {
            this.log.info(`[PitBoss] Using manually configured IP: ${this.config.grillIp}`);
            return this.config.grillIp;
        }
        if (this.config.autoDiscover !== false) {
            const discovery = new discovery_1.GrillDiscovery(this.log, this.config.deviceId);
            const result = await discovery.discover();
            if (result) {
                this.log.info(`[PitBoss] Discovered grill: ${result.deviceId} @ ${result.ip} (via ${result.method})`);
                return result.ip;
            }
        }
        return null;
    }
    registerAccessory(grillIp) {
        const uuid = this.api.hap.uuid.generate(`pitboss-${grillIp}`);
        const displayName = this.config.name;
        let platformAccessory = this.accessories.get(uuid);
        if (platformAccessory) {
            this.log.info(`[PitBoss] Reusing cached accessory: ${displayName}`);
        }
        else {
            this.log.info(`[PitBoss] Registering new accessory: ${displayName}`);
            platformAccessory = new this.api.platformAccessory(displayName, uuid);
            platformAccessory.context.grillIp = grillIp;
            platformAccessory.context.model = this.config.grillModel;
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [platformAccessory]);
            this.accessories.set(uuid, platformAccessory);
        }
        this.grillAccessory = new accessory_1.PitBossAccessory(this, platformAccessory, this.client);
    }
}
exports.PitBossPlatform = PitBossPlatform;
//# sourceMappingURL=platform.js.map