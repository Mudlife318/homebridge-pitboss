export const PLUGIN_NAME = 'homebridge-pitboss';
export const PLATFORM_NAME = 'PitBoss';

// Polling
export const DEFAULT_POLL_INTERVAL_MS = 5000;    // Active polling (grill on)
export const DEFAULT_SLEEP_INTERVAL_MS = 60000;  // Sleep polling (grill off)
export const DEFAULT_SLEEP_TIMEOUT_MS = 0;        // Delay before entering sleep (0 = immediate)
export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

// Grill limits (PBV4PS2)
export const GRILL_MIN_TEMP_F = 130;
export const GRILL_MAX_TEMP_F = 420;
export const DEFAULT_TARGET_TEMP_F = 225;
export const PROBE_UNPLUGGED_SENTINEL = 900; // Grill returns 960 when probe not connected

// Discovery
export const MDNS_DISCOVERY_TIMEOUT_MS = 10000;
export const NETWORK_SCAN_TIMEOUT_MS = 1500;  // Per-host probe timeout
export const NETWORK_SCAN_CONCURRENCY = 20;   // Parallel hosts to probe

/**
 * Full plugin config as entered in Homebridge UI / config.json
 */
export interface PitBossConfig {
  platform: string;
  name: string;

  // ── Connection ────────────────────────────────────────────────────────────
  /** Grill local IP address. If set, skips autodiscovery entirely. */
  grillIp?: string;

  // ── Discovery ─────────────────────────────────────────────────────────────
  /** Enable automatic grill discovery via mDNS + network scan. Default: true */
  autoDiscover?: boolean;
  /**
   * Grill device ID (e.g. PBL-30C922A57F70) to match during discovery.
   * Found on the grill's web interface at http://<ip>/conf9.json.
   * Optional — speeds up mDNS matching but not required.
   */
  deviceId?: string;

  // ── Polling ───────────────────────────────────────────────────────────────
  /** Poll interval in ms while grill is ON. Default: 5000 */
  pollInterval?: number;
  /** Poll interval in ms while grill is OFF (sleep mode). Default: 60000 */
  sleepInterval?: number;
  /**
   * How long (ms) after grill turns off before entering sleep mode.
   * Useful to avoid flickering if grill briefly shows moduleIsOn=false.
   * Default: 0 (immediate)
   */
  sleepTimeout?: number;

  // ── Advanced ──────────────────────────────────────────────────────────────
  /** Grill model. Default: PBV4PS2 */
  grillModel?: string;
  /** Grill password if set via SmokeIT app. Default: empty */
  grillPassword?: string;
  /** HTTP request timeout in ms. Default: 8000 */
  requestTimeout?: number;
}
