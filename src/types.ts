/**
 * Full decoded state from the grill controller.
 * Populated from both the FE0B (status) and FE0C (temperatures) responses.
 */
export interface GrillState {
  // Temperatures
  grillTemp: number;
  grillSetTemp: number;
  smokerActTemp: number;
  p1Target: number;
  p1Temp: number;
  p2Temp: number;
  p3Temp: number;
  p4Temp: number;

  // Module / power
  moduleIsOn: boolean;

  // Actuators
  fanState: boolean;
  hotState: boolean;
  motorState: boolean;
  lightState: boolean;
  primeState: boolean;

  // Faults
  noPellets: boolean;
  highTempErr: boolean;
  fanErr: boolean;
  hotErr: boolean;
  motorErr: boolean;
  err1: boolean;
  err2: boolean;
  err3: boolean;
  erL: boolean;

  // Misc
  isFahrenheit: boolean;
  recipeStep: number;
}

/** Shape of the PB.GetState RPC response */
export interface GetStateResponse {
  sc_11?: string;  // Status hex payload
  sc_12?: string;  // Temperatures hex payload
}

/** Result of a grill discovery attempt */
export interface DiscoveryResult {
  ip: string;
  deviceId: string;
  method: 'mdns' | 'network-scan' | 'manual';
}
