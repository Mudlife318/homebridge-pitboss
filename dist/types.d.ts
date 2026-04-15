export interface GrillState {
    grillTemp: number;
    grillSetTemp: number;
    smokerActTemp: number;
    p1Target: number;
    p1Temp: number;
    p2Temp: number;
    p3Temp: number;
    p4Temp: number;
    moduleIsOn: boolean;
    fanState: boolean;
    hotState: boolean;
    motorState: boolean;
    lightState: boolean;
    primeState: boolean;
    noPellets: boolean;
    highTempErr: boolean;
    fanErr: boolean;
    hotErr: boolean;
    motorErr: boolean;
    err1: boolean;
    err2: boolean;
    err3: boolean;
    erL: boolean;
    isFahrenheit: boolean;
    recipeStep: number;
}
export interface GetStateResponse {
    sc_11?: string;
    sc_12?: string;
}
export interface DiscoveryResult {
    ip: string;
    deviceId: string;
    method: 'mdns' | 'network-scan' | 'manual';
}
//# sourceMappingURL=types.d.ts.map