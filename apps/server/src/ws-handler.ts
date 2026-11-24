import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import {
  SIGNALING_CONN_RATE_PER_MIN,
  type ClientMessage,
} from '@bagas-share/shared';
import { extractClientIp, normalizeIpToGroup } from './ip-group.js';
import type { StateDatabase } from './db.js';
import type { GroupManager } from './group-manager.js';
import type { TransferManager } from './transfer-manager.js';

const PAIR_CREATE_MAX_PER_HOUR = 5;
const PAIR_CREATE_WINDOW_MS = 60 * 60 * 1000;

export class SignalingHandler {
  private connRate = new Map<string, { count: number; resetAt: number }>();
  private pairCreateRate = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private db: StateDatabase,
    private groups: GroupManager,
    private transfers: TransferManager,
    private trustProxy: boolean
  ) {}

  pruneRateLimits(nowMs: number = Date.now()): void {
    for (const [ip, entry] of this.connRate) {
      if (nowMs > entry.resetAt) this.connRate.delete(ip);
    }
    for (const [ip, entry] of this.pairCreateRate) {
      if (nowMs > entry.resetAt) this.pairCreateRate.delete(ip);
    }
  }

  private checkConnectionRate(ip: string, nowMs: number = Date.now()): boolean {
    if (this.connRate.size > 1000) this.pruneRateLimits(nowMs);
    const entry = this.connRate.get(ip);
    if (!entry || nowMs > entry.resetAt) {
      this.connRate.set(ip, { count: 1, resetAt: nowMs + 60_000 });
      return true;
    }
    entry.count += 1;
    return entry.count <= SIGNALING_CONN_RATE_PER_MIN;
  }

  private checkPairCreateRate(
    ip: string,
    nowMs: number = Date.now()
  ): { ok: true } | { ok: false; retryAfterSec: number } {
    if (this.pairCreateRate.size > 1000) this.pruneRateLimits(nowMs);
    const entry = this.pairCreateRate.get(ip);
    if (!entry || nowMs > entry.resetAt) {
      this.pairCreateRate.set(ip, { count: 1, resetAt: nowMs + PAIR_CREATE_WINDOW_MS });
      return { ok: true };
    }
    if (entry.count >= PAIR_CREATE_MAX_PER_HOUR) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000)),
      };
    }
    entry.count += 1;
    return { ok: true };
  }

  handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientIp = extractClientIp(req, this.trustProxy);
    if (!this.checkConnectionRate(clientIp)) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    const url = new URL(req.url || '/ws', 'http://localhost');
    const rawDeviceId = url.searchParams.get('deviceId')?.trim();
    const requestedDeviceId =
      rawDeviceId && /^[a-zA-Z0-9_-]{6,64}$/.test(rawDeviceId)
        ? rawDeviceId
        : randomUUID();
    const rawSessionToken = url.searchParams.get('sessionToken')?.trim();
    const sessionToken =
      rawSessionToken && /^[a-zA-Z0-9_-]{16,128}$/.test(rawSessionToken)
        ? rawSessionToken
        : randomUUID();
    const pairToken = url.searchParams.get('pairToken')?.trim();
    const pairedGroupId = this.db.resolvePairToken(pairToken);

    const groupId = pairedGroupId || normalizeIpToGroup(clientIp);
    const source = pairedGroupId ? 'pairing_code' : 'auto_ip';

    const reg = this.groups.registerOrReconnect({
      deviceId: requestedDeviceId,
      sessionToken,
      groupId,
      source,
      userAgent: req.headers['user-agent'],
      clientIp,
      ws,
    });

    if (!reg.ok) {
      ws.send(JSON.stringify({ type: 'group:full' }));
      ws.close(1000, 'Group full');
      return;
    }

    const deviceId = reg.device.deviceId;
    const quota = this.db.getQuotaStatus(clientIp);
    this.groups.sendTo(deviceId, {
      type: 'welcome',
      deviceId,
      displayName: reg.device.displayName,
      kind: reg.device.kind,
      groupId: reg.device.groupId,
      quotaRemaining: quota.remaining,
      quotaResetAt: quota.resetAt,
    });

    this.groups.sendTo(deviceId, {
      type: 'peers:update',
      peers: this.groups.getPeersFor(deviceId),
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        this.handleMessage(deviceId, clientIp, msg);
      } catch {
        // Abaikan payload JSON tidak valid
      }
    });

    ws.on('close', () => {
      this.groups.markSocketClosed(deviceId, ws);
    });
  }

  private handleMessage(deviceId: string, clientIp: string, msg: ClientMessage): void {
    this.groups.touchHeartbeat(deviceId);

    switch (msg.type) {
      case 'heartbeat':
        return;

      case 'pair:create': {
        const dev = this.groups.getDevice(deviceId);
        if (!dev) return;
        const rate = this.checkPairCreateRate(clientIp);
        if (!rate.ok) {
          this.groups.sendTo(deviceId, {
            type: 'pair:error',
            reason: 'rate_limited',
            retryAfterSec: rate.retryAfterSec,
          });
          return;
        }
        const created = this.db.createPairingCode(dev.groupId, deviceId);
        this.groups.sendTo(deviceId, {
          type: 'pair:created',
          code: created.code,
          expiresAt: created.expiresAt,
          pairToken: created.pairToken,
        });
        return;
      }

      case 'pair:join': {
        const res = this.db.redeemPairingCode(msg.code || '', deviceId, clientIp);
        if (!res.ok || !res.groupId || !res.pairToken) {
          this.groups.sendTo(deviceId, {
            type: 'pair:error',
            reason: res.reason || 'invalid',
            retryAfterSec: res.retryAfterSec,
          });
          return;
        }
        const moved = this.groups.moveDeviceToGroup(
          deviceId,
          res.groupId,
          'pairing_code'
        );
        if (!moved.ok) {
          this.groups.sendTo(deviceId, {
            type: 'pair:error',
            reason: 'group_full',
          });
          return;
        }
        this.groups.sendTo(deviceId, {
          type: 'pair:joined',
          groupId: res.groupId,
          pairToken: res.pairToken,
        });
        return;
      }

      case 'transfer:request': {
        this.transfers.createTransferRequest({
          senderDeviceId: deviceId,
          targetDeviceId: msg.targetDeviceId,
          files: Array.isArray(msg.files) ? msg.files : [],
          resumeTransferId: msg.resumeTransferId,
        });
        return;
      }

      case 'transfer:respond': {
        this.transfers.respondToTransfer(
          deviceId,
          msg.transferId,
          Boolean(msg.accept),
          msg.reason
        );
        return;
      }

      case 'transfer:cancel': {
        this.transfers.cancelTransfer(deviceId, msg.transferId);
        return;
      }

      case 'rtc:signal': {
        this.transfers.relayRtcSignal({
          fromDeviceId: deviceId,
          targetDeviceId: msg.targetDeviceId,
          transferId: msg.transferId,
          sdp: msg.sdp,
          ice: msg.ice,
        });
        return;
      }

      case 'transfer:complete': {
        this.transfers.completeTransfer(
          deviceId,
          msg.transferId,
          Number(msg.filesReceived) || 1
        );
        return;
      }
    }
  }
}
