import { GrillState, GetStateResponse } from './types';
export declare const CMD: {
    readonly GET_STATUS: "FE0B01FF";
    readonly GET_TEMPERATURES: "FE0C01FF";
    readonly TURN_OFF: "FE0102FF";
    readonly SET_FAHRENHEIT: "FE0901FF";
    readonly SET_CELSIUS: "FE0902FF";
    readonly TURN_LIGHT_ON: "FE0201FF";
    readonly TURN_LIGHT_OFF: "FE0202FF";
    readonly TURN_PRIMER_ON: "FE0801FF";
    readonly TURN_PRIMER_OFF: "FE0800FF";
};
export declare function cmdSetGrillTemp(tempF: number): string;
export declare function cmdSetProbe1Temp(tempF: number): string;
export declare function cmdSetProbe2Temp(tempF: number): string;
export declare function parseStatus(hex: string): Partial<GrillState> | null;
export declare function parseTemperatures(hex: string): Partial<GrillState> | null;
export declare function parseGetStateResponse(resp: GetStateResponse): Partial<GrillState> | null;
//# sourceMappingURL=grillProtocol.d.ts.map