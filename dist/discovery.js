"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrillDiscovery = void 0;
const os = __importStar(require("os"));
const net = __importStar(require("net"));
const http = __importStar(require("http"));
const settings_1 = require("./settings");
class GrillDiscovery {
    constructor(log, deviceId) {
        this.log = log;
        this.deviceId = deviceId;
    }
    async discover() {
        this.log.info('[Discovery] Starting grill autodiscovery...');
        const mdnsResult = await this.discoverViaMdns();
        if (mdnsResult) {
            this.log.info(`[Discovery] Found via mDNS: ${mdnsResult.deviceId} @ ${mdnsResult.ip}`);
            return mdnsResult;
        }
        this.log.info('[Discovery] mDNS found nothing — falling back to network scan...');
        const scanResult = await this.discoverViaScan();
        if (scanResult) {
            this.log.info(`[Discovery] Found via network scan: ${scanResult.deviceId} @ ${scanResult.ip}`);
            return scanResult;
        }
        this.log.warn('[Discovery] No Pit Boss grill found. Set grillIp manually in plugin config.');
        return null;
    }
    discoverViaMdns() {
        return new Promise((resolve) => {
            let resolved = false;
            let mdns;
            const done = (result) => {
                if (resolved)
                    return;
                resolved = true;
                try {
                    mdns?.destroy();
                }
                catch { }
                resolve(result);
            };
            const timer = setTimeout(() => done(null), settings_1.MDNS_DISCOVERY_TIMEOUT_MS);
            try {
                mdns = require('multicast-dns')();
                const ptrTargets = new Set();
                const srvHosts = new Map();
                const aRecords = new Map();
                const tryResolve = () => {
                    for (const [hostname, _port] of srvHosts) {
                        const ip = aRecords.get(hostname) || aRecords.get(hostname.replace(/\.$/, ''));
                        if (ip) {
                            const upperHost = hostname.toUpperCase();
                            if (upperHost.includes('PBL-')) {
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
                    }
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
                mdns.on('response', (response) => {
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
                mdns.query([
                    { name: '_http._tcp.local', type: 'PTR' },
                    { name: '_mongoose._tcp.local', type: 'PTR' },
                ]);
                if (this.deviceId) {
                    const hostname = this.deviceId.endsWith('.local')
                        ? this.deviceId
                        : `${this.deviceId}.local`;
                    mdns.query([{ name: hostname, type: 'A' }]);
                }
            }
            catch (err) {
                this.log.debug(`[Discovery] mDNS error: ${err}`);
                done(null);
            }
        });
    }
    async discoverViaScan() {
        const subnets = this.getLocalSubnets();
        if (subnets.length === 0) {
            this.log.warn('[Discovery] No local network interfaces found for scanning');
            return null;
        }
        for (const subnet of subnets) {
            this.log.info(`[Discovery] Scanning subnet ${subnet}0/24...`);
            const result = await this.scanSubnet(subnet);
            if (result)
                return result;
        }
        return null;
    }
    async scanSubnet(subnetBase) {
        const hosts = [];
        for (let i = 1; i <= 254; i++) {
            hosts.push(`${subnetBase}${i}`);
        }
        for (let i = 0; i < hosts.length; i += settings_1.NETWORK_SCAN_CONCURRENCY) {
            const batch = hosts.slice(i, i + settings_1.NETWORK_SCAN_CONCURRENCY);
            const results = await Promise.all(batch.map((ip) => this.probeHost(ip)));
            const found = results.find((r) => r !== null);
            if (found)
                return found;
        }
        return null;
    }
    probeHost(ip) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(settings_1.NETWORK_SCAN_TIMEOUT_MS);
            socket.connect(80, ip, () => {
                socket.destroy();
                this.fetchConf9(ip).then(resolve);
            });
            socket.on('error', () => { socket.destroy(); resolve(null); });
            socket.on('timeout', () => { socket.destroy(); resolve(null); });
        });
    }
    fetchConf9(ip) {
        return new Promise((resolve) => {
            const req = http.get({ hostname: ip, port: 80, path: '/conf9.json', timeout: settings_1.NETWORK_SCAN_TIMEOUT_MS }, (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const id = json?.device?.id ?? '';
                        if (id.startsWith('PBL-')) {
                            if (this.deviceId && !id.toUpperCase().includes(this.deviceId.toUpperCase())) {
                                resolve(null);
                                return;
                            }
                            resolve({ ip, deviceId: id, method: 'network-scan' });
                        }
                        else {
                            resolve(null);
                        }
                    }
                    catch {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
        });
    }
    getLocalSubnets() {
        const subnets = [];
        const interfaces = os.networkInterfaces();
        for (const addrs of Object.values(interfaces)) {
            for (const addr of addrs ?? []) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    const parts = addr.address.split('.');
                    if (parts.length === 4) {
                        subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}.`);
                    }
                }
            }
        }
        return [...new Set(subnets)];
    }
}
exports.GrillDiscovery = GrillDiscovery;
//# sourceMappingURL=discovery.js.map