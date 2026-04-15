"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PitBossAccessory = void 0;
const settings_1 = require("./settings");
const grillProtocol_1 = require("./grillProtocol");
const fToC = (f) => Math.round(((f - 32) * 5 / 9) * 10) / 10;
const cToF = (c) => Math.round((c * 9 / 5) + 32);
class PitBossAccessory {
    constructor(platform, accessory, client) {
        this.accessory = accessory;
        this.client = client;
        this.cachedState = {};
        this.hap = platform.api.hap;
        this.log = platform.log;
        const { Service: Svc, Characteristic: Char } = this.hap;
        const info = accessory.getService(Svc.AccessoryInformation) ||
            accessory.addService(Svc.AccessoryInformation);
        info
            .setCharacteristic(Char.Manufacturer, 'Pit Boss / Dansons')
            .setCharacteristic(Char.Model, 'PBV4PS2 Pro Series 4 V2')
            .setCharacteristic(Char.SerialNumber, accessory.UUID);
        this.thermostatService =
            accessory.getService(Svc.Thermostat) ||
                accessory.addService(Svc.Thermostat, 'Grill Temperature');
        this.thermostatService
            .getCharacteristic(Char.CurrentHeatingCoolingState)
            .onGet(() => (this.cachedState.moduleIsOn ? 1 : 0));
        this.thermostatService
            .getCharacteristic(Char.TargetHeatingCoolingState)
            .setProps({ validValues: [0, 1] })
            .onGet(() => (this.cachedState.moduleIsOn ? 1 : 0))
            .onSet(async (v) => {
            if (v === 0) {
                this.log.info('[PitBoss] Shutdown requested via thermostat');
                await this.client.sendCommand(grillProtocol_1.CMD.TURN_OFF);
            }
        });
        this.thermostatService
            .getCharacteristic(Char.CurrentTemperature)
            .setProps({ minValue: -40, maxValue: 300, minStep: 0.5 })
            .onGet(() => fToC(this.cachedState.grillTemp ?? settings_1.DEFAULT_TARGET_TEMP_F));
        this.thermostatService
            .getCharacteristic(Char.TargetTemperature)
            .setProps({
            minValue: fToC(settings_1.GRILL_MIN_TEMP_F),
            maxValue: fToC(settings_1.GRILL_MAX_TEMP_F),
            minStep: 0.5,
        })
            .onGet(() => fToC(this.cachedState.grillSetTemp ?? settings_1.DEFAULT_TARGET_TEMP_F))
            .onSet(async (v) => {
            const tempF = cToF(v);
            const cmd = (0, grillProtocol_1.cmdSetGrillTemp)(tempF);
            this.log.info(`[PitBoss] Set grill → ${Math.round(tempF / 10) * 10}°F`);
            await this.client.sendCommand(cmd);
        });
        this.thermostatService
            .getCharacteristic(Char.TemperatureDisplayUnits)
            .setValue(1);
        this.probe1Service =
            accessory.getServiceById(Svc.TemperatureSensor, 'probe1') ||
                accessory.addService(Svc.TemperatureSensor, 'Meat Probe 1', 'probe1');
        this.probe1Service
            .getCharacteristic(Char.CurrentTemperature)
            .setProps({ minValue: -40, maxValue: 120, minStep: 0.5 })
            .onGet(() => {
            const t = this.cachedState.p1Temp;
            return (t !== undefined && t < settings_1.PROBE_UNPLUGGED_SENTINEL) ? fToC(t) : fToC(32);
        });
        this.probe1Service
            .getCharacteristic(Char.StatusActive)
            .onGet(() => {
            const t = this.cachedState.p1Temp;
            return !this.cachedState.err1 && t !== undefined && t < settings_1.PROBE_UNPLUGGED_SENTINEL;
        });
        this.probe2Service =
            accessory.getServiceById(Svc.TemperatureSensor, 'probe2') ||
                accessory.addService(Svc.TemperatureSensor, 'Meat Probe 2', 'probe2');
        this.probe2Service
            .getCharacteristic(Char.CurrentTemperature)
            .setProps({ minValue: -40, maxValue: 120, minStep: 0.5 })
            .onGet(() => {
            const t = this.cachedState.p2Temp;
            return (t !== undefined && t < settings_1.PROBE_UNPLUGGED_SENTINEL) ? fToC(t) : fToC(32);
        });
        this.probe2Service
            .getCharacteristic(Char.StatusActive)
            .onGet(() => {
            const t = this.cachedState.p2Temp;
            return !this.cachedState.err2 && t !== undefined && t < settings_1.PROBE_UNPLUGGED_SENTINEL;
        });
        this.occupancyService =
            accessory.getServiceById(Svc.OccupancySensor, 'running') ||
                accessory.addService(Svc.OccupancySensor, 'Grill Running', 'running');
        this.occupancyService
            .getCharacteristic(Char.OccupancyDetected)
            .onGet(() => (this.cachedState.moduleIsOn ? 1 : 0));
        this.pelletsService =
            accessory.getServiceById(Svc.ContactSensor, 'pellets') ||
                accessory.addService(Svc.ContactSensor, 'Pellets Empty', 'pellets');
        this.pelletsService
            .getCharacteristic(Char.ContactSensorState)
            .onGet(() => (this.cachedState.noPellets ? 1 : 0));
        this.shutdownService =
            accessory.getServiceById(Svc.Switch, 'shutdown') ||
                accessory.addService(Svc.Switch, 'Grill Shutdown', 'shutdown');
        this.shutdownService
            .getCharacteristic(Char.On)
            .onGet(() => false)
            .onSet(async (v) => {
            if (v) {
                this.log.info('[PitBoss] Shutdown switch triggered');
                await this.client.sendCommand(grillProtocol_1.CMD.TURN_OFF);
                setTimeout(() => {
                    this.shutdownService.updateCharacteristic(this.hap.Characteristic.On, false);
                }, 1500);
            }
        });
        this.primerService =
            accessory.getServiceById(Svc.Switch, 'primer') ||
                accessory.addService(Svc.Switch, 'Primer Motor', 'primer');
        this.primerService
            .getCharacteristic(Char.On)
            .onGet(() => this.cachedState.primeState ?? false)
            .onSet(async (v) => {
            const on = v;
            this.log.info(`[PitBoss] Primer motor ${on ? 'ON' : 'OFF'}`);
            await this.client.sendCommand(on ? grillProtocol_1.CMD.TURN_PRIMER_ON : grillProtocol_1.CMD.TURN_PRIMER_OFF);
        });
    }
    updateState(state) {
        Object.assign(this.cachedState, state);
        const { Characteristic: Char } = this.hap;
        if (state.grillTemp !== undefined)
            this.thermostatService.updateCharacteristic(Char.CurrentTemperature, fToC(state.grillTemp));
        if (state.grillSetTemp !== undefined)
            this.thermostatService.updateCharacteristic(Char.TargetTemperature, fToC(state.grillSetTemp));
        if (state.moduleIsOn !== undefined) {
            this.thermostatService.updateCharacteristic(Char.CurrentHeatingCoolingState, state.moduleIsOn ? 1 : 0);
            this.thermostatService.updateCharacteristic(Char.TargetHeatingCoolingState, state.moduleIsOn ? 1 : 0);
            this.occupancyService.updateCharacteristic(Char.OccupancyDetected, state.moduleIsOn ? 1 : 0);
        }
        if (state.p1Temp !== undefined) {
            const active = state.p1Temp < settings_1.PROBE_UNPLUGGED_SENTINEL;
            this.probe1Service.updateCharacteristic(Char.StatusActive, active && !state.err1);
            if (active)
                this.probe1Service.updateCharacteristic(Char.CurrentTemperature, fToC(state.p1Temp));
        }
        if (state.p2Temp !== undefined) {
            const active = state.p2Temp < settings_1.PROBE_UNPLUGGED_SENTINEL;
            this.probe2Service.updateCharacteristic(Char.StatusActive, active && !state.err2);
            if (active)
                this.probe2Service.updateCharacteristic(Char.CurrentTemperature, fToC(state.p2Temp));
        }
        if (state.noPellets !== undefined)
            this.pelletsService.updateCharacteristic(Char.ContactSensorState, state.noPellets ? 1 : 0);
        if (state.primeState !== undefined)
            this.primerService.updateCharacteristic(Char.On, state.primeState);
        if (state.noPellets)
            this.log.warn('[PitBoss] ⚠️  Pellet hopper empty!');
        if (state.highTempErr)
            this.log.warn('[PitBoss] ⚠️  High temp error!');
        if (state.fanErr)
            this.log.warn('[PitBoss] ⚠️  Fan error!');
        if (state.motorErr)
            this.log.warn('[PitBoss] ⚠️  Auger motor error!');
        if (state.hotErr)
            this.log.warn('[PitBoss] ⚠️  Igniter error!');
    }
}
exports.PitBossAccessory = PitBossAccessory;
//# sourceMappingURL=accessory.js.map