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
exports.GrillClient = void 0;
const http = __importStar(require("http"));
const settings_1 = require("./settings");
class GrillClient {
    constructor(ip, log, timeout = settings_1.DEFAULT_REQUEST_TIMEOUT_MS) {
        this.ip = ip;
        this.log = log;
        this.timeout = timeout;
    }
    async getState() {
        try {
            return await this.get('PB.GetState');
        }
        catch (err) {
            this.log.debug(`[GrillClient] getState failed: ${err}`);
            return null;
        }
    }
    async sendCommand(hexCmd) {
        return this.post('PB.SendMCUCommand', { command: hexCmd });
    }
    async probe() {
        try {
            const resp = await this.get('', '/conf9.json');
            const id = resp?.device?.id;
            if (id && id.startsWith('PBL-'))
                return id;
            return null;
        }
        catch {
            return null;
        }
    }
    get(method, path) {
        const url = path ?? `/rpc/${method}`;
        return this.request('GET', url);
    }
    post(method, body) {
        return this.request('POST', `/rpc/${method}`, body);
    }
    request(method, path, body) {
        return new Promise((resolve, reject) => {
            const bodyStr = body ? JSON.stringify(body) : undefined;
            const options = {
                hostname: this.ip,
                port: 80,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
                },
                timeout: this.timeout,
            };
            const req = http.request(options, (res) => {
                let raw = '';
                res.on('data', (chunk) => (raw += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(raw));
                    }
                    catch {
                        resolve(raw);
                    }
                });
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timed out: ${method} ${path}`));
            });
            req.on('error', reject);
            if (bodyStr)
                req.write(bodyStr);
            req.end();
        });
    }
}
exports.GrillClient = GrillClient;
//# sourceMappingURL=grillClient.js.map