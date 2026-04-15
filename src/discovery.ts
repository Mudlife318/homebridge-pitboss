import * as os from 'os';
import * as net from 'net';
import * as http from 'http';
import { Logger } from 'homebridge';
import { DiscoveryResult } from './types';
import {
  MDNS_DISCOVERY_TIMEOUT_MS,
  NETWORK_SCAN_TIMEOUT_MS,
  NETWORK_SCAN_CONCURRENCY,
} from './settings';

/**
 * GrillDiscovery
 *
 * Finds a Pit Boss grill on the local network using two strategies:
 *
 * 1. mDNS (fast, ~3s): Mongoose OS devices advertise via multicast DNS.
 *    Looks for _http._tcp services with a hostname matching PBL-*.
 *
 * 2. Network scan (fallback, ~10s): Scans the local /24 subnet, probing
 *    each host for port 80 + a valid /conf9.json with a PBL- device ID.
 *
 * If deviceId is provided, only matches that specific grill.
 */
export class GrillDiscovery {
  constructor(
    private readonly log: Logger,
    private readonly deviceId?: string,
  ) {}

  /** Run discovery — tries mDNS first, falls back to network scan */
  async discover(): Promise<DiscoveryResult | null> {
    this.log.info('[Discovery] Starting grill autodiscovery...');

    // Try mDNS first
    const mdnsResult = await this.discoverViaMdns();
    if (mdnsResult) {
      this.log.info(`[Discovery] Found via mDNS: ${mdnsResult.deviceId} @ ${mdnsResult.ip}`);
      return mdnsResult;
    }

    this.log.info('[Discovery] mDNS found nothing — falling back to network scan...');

    // Fallback to network scan
    const scanResult = await this.discoverViaScan();
    if (scanResult) {
      this.log.info(`[Discovery] Found via network scan: ${scanResult.deviceId} @ ${scanResult.ip}`);
      return scanResult;
    }

    this.log.warn('[Discovery] No Pit Boss grill found. Set grillIp manually in plugin config.');
    return null;
  }

  // ── mDNS discovery ────────────────────────────────────────────────────────

  private discoverViaMdns(): Promise<DiscoveryResult | null> {
    return new Promise((resolve) => {
      let resolved = false;
      let mdns: any;

      const done = (result: DiscoveryResult | null) => {
        if (resolved) return;
        resolved = true;
        try { mdns?.destroy(); } catch { /* ignore */ }
        resolve(result);
      };

      const timer = setTimeout(() => done(null), MDNS_DISCOVERY_TIMEOUT_MS);

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        mdns = require('multicast-dns')();

        // Track PTR → SRV → A record resolution
        const ptrTargets = new Set<string>();
        const srvHosts = new Map<string, number>(); // hostname -> port
        const aRecords = new Map<string, string>();  // hostname -> ip

        const tryResolve = () => {
          for (const [hostname, _port] of srvHosts) {
            const ip = aRecords.get(hostname) || aRecords.get(hostname.replace(/\.$/, ''));
            if (ip) {
              // Check if this hostname looks like a Pit Boss device
              const upperHost = hostname.toUpperCase();
              if (upperHost.includes('PBL-')) {
                // Extract device ID from hostname
                const match = hostname.match(/PBL-[0-9A-Fa-f]+/i);
                const foundDeviceId = match ? match[0].toUpperCase() : hostname;

                // If user specified a deviceId, only match that one
                if (this.deviceId && !foundDeviceId.includes(this.deviceId.toUpperCase())) {
                  continue;
                }

                clearTimeout(timer);
                done({ ip, deviceId: foundDeviceId, method: 'mdns' });
                return;
              }
            }
          }

          // Also check A records directly for PBL- hostnames
          for (const [hostname, ip] of aRecords) {
            if (hostname.toUpperCase().includes('PBL-')) {
              const match = hostname.match(/PBL-[0-9A-Fa-f]+/i);
              const foundDeviceId = match ? match[0].toUpperCase() : hostname;
              if (this.deviceId && !foundDeviceId.includes(this.deviceId.toUpperCase())) {
                continue;
              }
              clearTimeout(timer);
              done({ ip, deviceId: foundDeviceId, method: 'mdns' });
              return;
            }
          }
        };

        mdns.on('response', (response: any) => {
          const all = [...(response.answers || []), ...(response.additionals || [])];

          for (const record of all) {
            if (record.type === 'PTR' && typeof record.data === 'string') {
              ptrTargets.add(record.data);
            }
            if (record.type === 'SRV' && record.data) {
              srvHosts.set(record.data.target, record.data.port);
            }
            if (record.type === 'A' && typeof record.data === 'string') {
              aRecords.set(record.name, record.data);
              // Immediately check if this hostname is a Pit Boss
              if (record.name.toUpperCase().includes('PBL-')) {
                const match = record.name.match(/PBL-[0-9A-Fa-f]+/i);
                const foundDeviceId = match ? match[0].toUpperCase() : record.name;
                if (!this.deviceId || foundDeviceId.includes(this.deviceId.toUpperCase())) {
                  clearTimeout(timer);
                  done({ ip: record.data, deviceId: foundDeviceId, method: 'mdns' });
                  return;
                }
              }
            }
          }
          tryResolve();
        });

        // Query for HTTP services and any PBL- hostnames directly
        mdns.query([
          { name: '_http._tcp.local', type: 'PTR' },
          { name: '_mongoose._tcp.local', type: 'PTR' },
        ]);

        // If user provided deviceId, also query that hostname directly
        if (this.deviceId) {
          const hostname = this.deviceId.endsWith('.local')
            ? this.deviceId
            : `${this.deviceId}.local`;
          mdns.query([{ name: hostname, type: 'A' }]);
        }

      } catch (err) {
        this.log.debug(`[Discovery] mDNS error: ${err}`);
        done(null);
      }
    });
  }

  // ── Network scan discovery ────────────────────────────────────────────────

  private async discoverViaScan(): Promise<DiscoveryResult | null> {
    const subnets = this.getLocalSubnets();
    if (subnets.length === 0) {
      this.log.warn('[Discovery] No local network interfaces found for scanning');
      return null;
    }

    for (const subnet of subnets) {
      this.log.info(`[Discovery] Scanning subnet ${subnet}0/24...`);
      const result = await this.scanSubnet(subnet);
      if (result) return result;
    }

    return null;
  }

  private async scanSubnet(subnetBase: string): Promise<DiscoveryResult | null> {
    // Generate all 254 host addresses
    const hosts: string[] = [];
    for (let i = 1; i <= 254; i++) {
      hosts.push(`${subnetBase}${i}`);
    }

    // Process in batches to limit concurrency
    for (let i = 0; i < hosts.length; i += NETWORK_SCAN_CONCURRENCY) {
      const batch = hosts.slice(i, i + NETWORK_SCAN_CONCURRENCY);
      const results = await Promise.all(batch.map((ip) => this.probeHost(ip)));
      const found = results.find((r) => r !== null);
      if (found) return found;
    }

    return null;
  }

  private probeHost(ip: string): Promise<DiscoveryResult | null> {
    return new Promise((resolve) => {
      // First check port 80 is open (fast TCP connect)
      const socket = new net.Socket();
      socket.setTimeout(NETWORK_SCAN_TIMEOUT_MS);

      socket.connect(80, ip, () => {
        socket.destroy();
        // Port open — now check if it's a Pit Boss grill
        this.fetchConf9(ip).then(resolve);
      });

      socket.on('error', () => { socket.destroy(); resolve(null); });
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
    });
  }

  private fetchConf9(ip: string): Promise<DiscoveryResult | null> {
    return new Promise((resolve) => {
      const req = http.get(
        { hostname: ip, port: 80, path: '/conf9.json', timeout: NETWORK_SCAN_TIMEOUT_MS },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const id: string = json?.device?.id ?? '';
              if (id.startsWith('PBL-')) {
                if (this.deviceId && !id.toUpperCase().includes(this.deviceId.toUpperCase())) {
                  resolve(null);
                  return;
                }
                resolve({ ip, deviceId: id, method: 'network-scan' });
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  private getLocalSubnets(): string[] {
    const subnets: string[] = [];
    const interfaces = os.networkInterfaces();
    for (const addrs of Object.values(interfaces)) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const parts = addr.address.split('.');
          // Only scan /24 subnets (covers most home networks)
          if (parts.length === 4) {
            subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}.`);
          }
        }
      }
    }
    return [...new Set(subnets)]; // deduplicate
  }
}
