import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  Logger,
  HAP,
} from 'homebridge';

import { PitBossPlatform } from './platform';
import { GrillClient } from './grillClient';
import { GrillState } from './types';
import {
  GRILL_MIN_TEMP_F,
  GRILL_MAX_TEMP_F,
  DEFAULT_TARGET_TEMP_F,
  PROBE_UNPLUGGED_SENTINEL,
} from './settings';
import {
  cmdSetGrillTemp,
  cmdSetProbe1Temp,
  cmdSetProbe2Temp,
  CMD,
} from './grillProtocol';

const fToC = (f: number): number => Math.round(((f - 32) * 5 / 9) * 10) / 10;
const cToF = (c: number): number => Math.round((c * 9 / 5) + 32);

/**
 * PitBossAccessory
 *
 * HomeKit services exposed:
 *   Thermostat          — grill cabinet temp + target (Siri: "set grill to 225")
 *   TemperatureSensor×2 — meat probe 1 & 2 (automations: "when probe reaches 165")
 *   OccupancySensor     — grill is running (automations on cook start/end)
 *   ContactSensor       — pellets empty alert
 *   Switch (Shutdown)   — momentary off command
 *   Switch (Primer)     — primer motor toggle
 */
export class PitBossAccessory {
  private readonly hap: HAP;
  private readonly log: Logger;

  private readonly thermostatService: Service;
  private readonly probe1Service: Service;
  private readonly probe2Service: Service;
  private readonly occupancyService: Service;
  private readonly pelletsService: Service;
  private readonly shutdownService: Service;
  private readonly primerService: Service;

  private cachedState: Partial<GrillState> = {};

  constructor(
    platform: PitBossPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: GrillClient,
  ) {
    this.hap = platform.api.hap;
    this.log = platform.log;
    const { Service: Svc, Characteristic: Char } = this.hap;

    // ── Accessory Info ───────────────────────────────────────────────────────
    const info = accessory.getService(Svc.AccessoryInformation) ||
      accessory.addService(Svc.AccessoryInformation);
    info
      .setCharacteristic(Char.Manufacturer, 'Pit Boss / Dansons')
      .setCharacteristic(Char.Model, 'PBV4PS2 Pro Series 4 V2')
      .setCharacteristic(Char.SerialNumber, accessory.UUID);

    // ── Thermostat ───────────────────────────────────────────────────────────
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
        if ((v as number) === 0) {
          this.log.info('[PitBoss] Shutdown requested via thermostat');
          await this.client.sendCommand(CMD.TURN_OFF);
        }
      });

    this.thermostatService
      .getCharacteristic(Char.CurrentTemperature)
      .setProps({ minValue: -40, maxValue: 300, minStep: 0.5 })
      .onGet(() => fToC(this.cachedState.grillTemp ?? DEFAULT_TARGET_TEMP_F));

    this.thermostatService
      .getCharacteristic(Char.TargetTemperature)
      .setProps({
        minValue: fToC(GRILL_MIN_TEMP_F),
        maxValue: fToC(GRILL_MAX_TEMP_F),
        minStep: 0.5,
      })
      .onGet(() => fToC(this.cachedState.grillSetTemp ?? DEFAULT_TARGET_TEMP_F))
      .onSet(async (v) => {
        const tempF = cToF(v as number);
        const cmd = cmdSetGrillTemp(tempF);
        this.log.info(`[PitBoss] Set grill → ${Math.round(tempF / 10) * 10}°F`);
        await this.client.sendCommand(cmd);
      });

    this.thermostatService
      .getCharacteristic(Char.TemperatureDisplayUnits)
      .setValue(1); // Fahrenheit

    // ── Meat Probe 1 ─────────────────────────────────────────────────────────
    this.probe1Service =
      accessory.getServiceById(Svc.TemperatureSensor, 'probe1') ||
      accessory.addService(Svc.TemperatureSensor, 'Meat Probe 1', 'probe1');

    this.probe1Service
      .getCharacteristic(Char.CurrentTemperature)
      .setProps({ minValue: -40, maxValue: 120, minStep: 0.5 })
      .onGet(() => {
        const t = this.cachedState.p1Temp;
        return (t !== undefined && t < PROBE_UNPLUGGED_SENTINEL) ? fToC(t) : fToC(32);
      });

    this.probe1Service
      .getCharacteristic(Char.StatusActive)
      .onGet(() => {
        const t = this.cachedState.p1Temp;
        return !this.cachedState.err1 && t !== undefined && t < PROBE_UNPLUGGED_SENTINEL;
      });

    // ── Meat Probe 2 ─────────────────────────────────────────────────────────
    this.probe2Service =
      accessory.getServiceById(Svc.TemperatureSensor, 'probe2') ||
      accessory.addService(Svc.TemperatureSensor, 'Meat Probe 2', 'probe2');

    this.probe2Service
      .getCharacteristic(Char.CurrentTemperature)
      .setProps({ minValue: -40, maxValue: 120, minStep: 0.5 })
      .onGet(() => {
        const t = this.cachedState.p2Temp;
        return (t !== undefined && t < PROBE_UNPLUGGED_SENTINEL) ? fToC(t) : fToC(32);
      });

    this.probe2Service
      .getCharacteristic(Char.StatusActive)
      .onGet(() => {
        const t = this.cachedState.p2Temp;
        return !this.cachedState.err2 && t !== undefined && t < PROBE_UNPLUGGED_SENTINEL;
      });

    // ── Occupancy (grill running) ─────────────────────────────────────────────
    this.occupancyService =
      accessory.getServiceById(Svc.OccupancySensor, 'running') ||
      accessory.addService(Svc.OccupancySensor, 'Grill Running', 'running');

    this.occupancyService
      .getCharacteristic(Char.OccupancyDetected)
      .onGet(() => (this.cachedState.moduleIsOn ? 1 : 0));

    // ── Pellets Empty ─────────────────────────────────────────────────────────
    this.pelletsService =
      accessory.getServiceById(Svc.ContactSensor, 'pellets') ||
      accessory.addService(Svc.ContactSensor, 'Pellets Empty', 'pellets');

    this.pelletsService
      .getCharacteristic(Char.ContactSensorState)
      .onGet(() => (this.cachedState.noPellets ? 1 : 0));

    // ── Shutdown Switch ───────────────────────────────────────────────────────
    this.shutdownService =
      accessory.getServiceById(Svc.Switch, 'shutdown') ||
      accessory.addService(Svc.Switch, 'Grill Shutdown', 'shutdown');

    this.shutdownService
      .getCharacteristic(Char.On)
      .onGet(() => false)
      .onSet(async (v) => {
        if (v as boolean) {
          this.log.info('[PitBoss] Shutdown switch triggered');
          await this.client.sendCommand(CMD.TURN_OFF);
          setTimeout(() => {
            this.shutdownService.updateCharacteristic(this.hap.Characteristic.On, false);
          }, 1500);
        }
      });

    // ── Primer Switch ─────────────────────────────────────────────────────────
    this.primerService =
      accessory.getServiceById(Svc.Switch, 'primer') ||
      accessory.addService(Svc.Switch, 'Primer Motor', 'primer');

    this.primerService
      .getCharacteristic(Char.On)
      .onGet(() => this.cachedState.primeState ?? false)
      .onSet(async (v) => {
        const on = v as boolean;
        this.log.info(`[PitBoss] Primer motor ${on ? 'ON' : 'OFF'}`);
        await this.client.sendCommand(on ? CMD.TURN_PRIMER_ON : CMD.TURN_PRIMER_OFF);
      });
  }

  /** Called by PollManager with fresh state — pushes updates to HomeKit */
  updateState(state: Partial<GrillState>): void {
    Object.assign(this.cachedState, state);
    const { Characteristic: Char } = this.hap;

    // Thermostat
    if (state.grillTemp !== undefined)
      this.thermostatService.updateCharacteristic(Char.CurrentTemperature, fToC(state.grillTemp));
    if (state.grillSetTemp !== undefined)
      this.thermostatService.updateCharacteristic(Char.TargetTemperature, fToC(state.grillSetTemp));
    if (state.moduleIsOn !== undefined) {
      this.thermostatService.updateCharacteristic(Char.CurrentHeatingCoolingState, state.moduleIsOn ? 1 : 0);
      this.thermostatService.updateCharacteristic(Char.TargetHeatingCoolingState, state.moduleIsOn ? 1 : 0);
      this.occupancyService.updateCharacteristic(Char.OccupancyDetected, state.moduleIsOn ? 1 : 0);
    }

    // Probes — only update if plugged in (< sentinel value)
    if (state.p1Temp !== undefined) {
      const active = state.p1Temp < PROBE_UNPLUGGED_SENTINEL;
      this.probe1Service.updateCharacteristic(Char.StatusActive, active && !state.err1);
      if (active)
        this.probe1Service.updateCharacteristic(Char.CurrentTemperature, fToC(state.p1Temp));
    }
    if (state.p2Temp !== undefined) {
      const active = state.p2Temp < PROBE_UNPLUGGED_SENTINEL;
      this.probe2Service.updateCharacteristic(Char.StatusActive, active && !state.err2);
      if (active)
        this.probe2Service.updateCharacteristic(Char.CurrentTemperature, fToC(state.p2Temp));
    }

    // Alerts
    if (state.noPellets !== undefined)
      this.pelletsService.updateCharacteristic(Char.ContactSensorState, state.noPellets ? 1 : 0);
    if (state.primeState !== undefined)
      this.primerService.updateCharacteristic(Char.On, state.primeState);

    // Log faults
    if (state.noPellets)    this.log.warn('[PitBoss] ⚠️  Pellet hopper empty!');
    if (state.highTempErr)  this.log.warn('[PitBoss] ⚠️  High temp error!');
    if (state.fanErr)       this.log.warn('[PitBoss] ⚠️  Fan error!');
    if (state.motorErr)     this.log.warn('[PitBoss] ⚠️  Auger motor error!');
    if (state.hotErr)       this.log.warn('[PitBoss] ⚠️  Igniter error!');
  }
}
