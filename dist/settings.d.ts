export declare const PLUGIN_NAME = "homebridge-pitboss";
export declare const PLATFORM_NAME = "PitBoss";
export declare const DEFAULT_POLL_INTERVAL_MS = 5000;
export declare const DEFAULT_SLEEP_INTERVAL_MS = 60000;
export declare const DEFAULT_SLEEP_TIMEOUT_MS = 0;
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
export declare const GRILL_MIN_TEMP_F = 130;
export declare const GRILL_MAX_TEMP_F = 420;
export declare const DEFAULT_TARGET_TEMP_F = 225;
export declare const PROBE_UNPLUGGED_SENTINEL = 900;
export declare const MDNS_DISCOVERY_TIMEOUT_MS = 10000;
export declare const NETWORK_SCAN_TIMEOUT_MS = 1500;
export declare const NETWORK_SCAN_CONCURRENCY = 20;
export interface PitBossConfig {
    platform: string;
    name: string;
    grillIp?: string;
    autoDiscover?: boolean;
    deviceId?: string;
    pollInterval?: number;
    sleepInterval?: number;
    sleepTimeout?: number;
    grillModel?: string;
    grillPassword?: string;
    requestTimeout?: number;
}
//# sourceMappingURL=settings.d.ts.map