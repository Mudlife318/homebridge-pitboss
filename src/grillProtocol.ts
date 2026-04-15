import { GrillState, GetStateResponse } from './types';

// ── Hex command constants (PBV4PS2 control board) ───────────────────────────

export const CMD = {
  GET_STATUS:          'FE0B01FF',
  GET_TEMPERATURES:    'FE0C01FF',
  TURN_OFF:            'FE0102FF',
  SET_FAHRENHEIT:      'FE0901FF',
  SET_CELSIUS:         'FE0902FF',
  TURN_LIGHT_ON:       'FE0201FF',
  TURN_LIGHT_OFF:      'FE0202FF',
  TURN_PRIMER_ON:      'FE0801FF',
  TURN_PRIMER_OFF:     'FE0800FF',
} as const;

/** Build set-grill-temperature hex command (130–420°F) */
export function cmdSetGrillTemp(tempF: number): string {
  const t = Math.max(130, Math.min(420, Math.round(tempF)));
  return `FE0501${byte(Math.floor(t / 100))}${byte(Math.floor((t % 100) / 10))}${byte(t % 10)}FF`;
}

/** Build set-probe-1-temperature hex command */
export function cmdSetProbe1Temp(tempF: number): string {
  return `FE0502${byte(Math.floor(tempF / 100))}${byte(Math.floor((tempF % 100) / 10))}${byte(tempF % 10)}FF`;
}

/** Build set-probe-2-temperature hex command */
export function cmdSetProbe2Temp(tempF: number): string {
  return `FE0503${byte(Math.floor(tempF / 100))}${byte(Math.floor((tempF % 100) / 10))}${byte(tempF % 10)}FF`;
}

function byte(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase();
}

// ── Response parsing ─────────────────────────────────────────────────────────

function parseHex(hex: string): number[] {
  const h = hex.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < h.length; i += 2) {
    bytes.push(parseInt(h.slice(i, i + 2), 16));
  }
  return bytes;
}

function temp3(parts: number[], offset: number): number {
  if (offset + 2 >= parts.length) return 0;
  return parts[offset] * 100 + parts[offset + 1] * 10 + parts[offset + 2];
}

/**
 * Parse FE0B status payload into partial GrillState.
 * Byte positions sourced from pytboss grills.json status_function for PBV4PS2.
 */
export function parseStatus(hex: string): Partial<GrillState> | null {
  if (!hex.startsWith('FE0B')) return null;
  const p = parseHex(hex);
  if (p.length < 44) return null;
  return {
    moduleIsOn:   p[24] === 1,
    err1:         p[25] === 1,
    err2:         p[26] === 1,
    err3:         p[27] === 1,
    highTempErr:  p[28] === 1,
    fanErr:       p[29] === 1,
    hotErr:       p[30] === 1,
    motorErr:     p[31] === 1,
    noPellets:    p[32] === 1,
    erL:          p[33] === 1,
    fanState:     p[34] === 1,
    hotState:     p[35] === 1,
    motorState:   p[36] === 1,
    lightState:   p[37] === 1,
    primeState:   p[38] === 1,
    recipeStep:   p[40],
  };
}

/**
 * Parse FE0C temperatures payload into partial GrillState.
 * Byte positions sourced from pytboss grills.json temperatures_function for PBV4PS2.
 */
export function parseTemperatures(hex: string): Partial<GrillState> | null {
  if (!hex.startsWith('FE0C')) return null;
  const p = parseHex(hex);
  if (p.length < 27) return null;
  return {
    p1Target:      temp3(p, 2),
    p1Temp:        temp3(p, 5),
    p2Temp:        temp3(p, 8),
    p3Temp:        temp3(p, 11),
    p4Temp:        temp3(p, 14),
    smokerActTemp: temp3(p, 17),
    grillSetTemp:  temp3(p, 20),
    grillTemp:     temp3(p, 23),
    isFahrenheit:  p[26] === 1,
  };
}

/**
 * Merge sc_11 + sc_12 from a PB.GetState response into a full GrillState.
 * Returns null if neither payload could be parsed.
 */
export function parseGetStateResponse(resp: GetStateResponse): Partial<GrillState> | null {
  const state: Partial<GrillState> = {};
  let gotAny = false;

  if (resp.sc_11) {
    const s = parseStatus(resp.sc_11);
    if (s) { Object.assign(state, s); gotAny = true; }
  }
  if (resp.sc_12) {
    const t = parseTemperatures(resp.sc_12);
    if (t) { Object.assign(state, t); gotAny = true; }
  }

  return gotAny ? state : null;
}
