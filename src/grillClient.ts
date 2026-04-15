import * as http from 'http';
import { Logger } from 'homebridge';
import { GetStateResponse } from './types';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './settings';

/**
 * GrillClient
 *
 * Talks directly to the Mongoose OS HTTP RPC endpoint on the grill controller.
 * No Python bridge, no pytboss, no Bluetooth — pure Node.js http module.
 *
 * The grill controller runs Mongoose OS 6.16 and exposes:
 *   GET  http://<ip>/rpc/<MethodName>         → for read-only calls
 *   POST http://<ip>/rpc/<MethodName>  + JSON → for commands
 */
export class GrillClient {
  private readonly ip: string;
  private readonly timeout: number;
  private readonly log: Logger;

  constructor(ip: string, log: Logger, timeout = DEFAULT_REQUEST_TIMEOUT_MS) {
    this.ip = ip;
    this.log = log;
    this.timeout = timeout;
  }

  /** Fetch current grill state (status + temperatures in one call) */
  async getState(): Promise<GetStateResponse | null> {
    try {
      return await this.get<GetStateResponse>('PB.GetState');
    } catch (err) {
      this.log.debug(`[GrillClient] getState failed: ${err}`);
      return null;
    }
  }

  /** Send a raw MCU hex command to the grill (POST required) */
  async sendCommand(hexCmd: string): Promise<unknown> {
    return this.post('PB.SendMCUCommand', { command: hexCmd });
  }

  /** Probe this IP to check if it's a Pit Boss grill — returns deviceId or null */
  async probe(): Promise<string | null> {
    try {
      const resp = await this.get<{ device?: { id?: string } }>('', '/conf9.json');
      const id = resp?.device?.id;
      if (id && id.startsWith('PBL-')) return id;
      return null;
    } catch {
      return null;
    }
  }

  // ─── Private HTTP helpers ─────────────────────────────────────────────────

  private get<T>(method: string, path?: string): Promise<T> {
    const url = path ?? `/rpc/${method}`;
    return this.request<T>('GET', url);
  }

  private post<T>(method: string, body: unknown): Promise<T> {
    return this.request<T>('POST', `/rpc/${method}`, body);
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
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
            resolve(JSON.parse(raw) as T);
          } catch {
            resolve(raw as unknown as T);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out: ${method} ${path}`));
      });

      req.on('error', reject);

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
