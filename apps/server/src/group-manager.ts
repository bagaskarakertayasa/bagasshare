import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  GROUP_MAX_DEVICES,
  OFFLINE_TIMEOUT_MS,
  type ColorSlot,
  type DeviceKind,
  type GroupSource,
  type PeerInfo,
  type ServerMessage,
} from '@bagas-share/shared';
import { assignUniqueDisplayName, parseUserAgent } from './ua-name.js';

export interface ConnectedDevice {
  deviceId: string;
  sessionToken: string;
  baseName: string;
  displayName: string;
  kind: DeviceKind;
  groupId: string;
  source: GroupSource;
  colorSlot: ColorSlot;
  clientIp: string;
  ws: WebSocket | null;
  lastHeartbeatAt: number;
  busy: boolean;
}

export class GroupManager {
  private devices = new Map<string, ConnectedDevice>();
  private groups = new Map<string, Set<string>>();

  registerOrReconnect(params: {
    deviceId: string;
    sessionToken: string;
    groupId: string;
    source: GroupSource;
    userAgent: string | undefined;
    clientIp: string;
    ws: WebSocket;
    nowMs?: number;
  }): { ok: true; device: ConnectedDevice } | { ok: false; reason: 'group_full' } {
    const nowMs = params.nowMs ?? Date.now();
    const existing = this.devices.get(params.deviceId);
    let effectiveDeviceId = params.deviceId;

    // F4: Hanya izinkan reconnect ke deviceId yang sama jika sessionToken rahasia cocok
    if (existing) {
      if (existing.sessionToken === params.sessionToken) {
        if (existing.groupId === params.groupId) {
          if (existing.ws && existing.ws !== params.ws) {
            try {
              existing.ws.close();
            } catch {
              // abaikan
            }
          }
          existing.ws = params.ws;
          existing.lastHeartbeatAt = nowMs;
          existing.clientIp = params.clientIp;
          existing.source = params.source;
          this.broadcastGroup(existing.groupId);
          return { ok: true, device: existing };
        }
        // Pemilik sah berpindah grup
        this.removeDevice(existing.deviceId);
      } else {
        // Klien lain mencoba memakai deviceId yang sudah aktif: jangan putus korban, beri ID baru
        effectiveDeviceId = randomUUID();
      }
    }

    const groupSet = this.groups.get(params.groupId) ?? new Set<string>();
    if (groupSet.size >= GROUP_MAX_DEVICES) {
      return { ok: false, reason: 'group_full' };
    }

    const { baseName, kind } = parseUserAgent(params.userAgent);
    const existingNames: string[] = [];
    const usedSlots = new Set<ColorSlot>();

    for (const memberId of groupSet) {
      const m = this.devices.get(memberId);
      if (m) {
        existingNames.push(m.displayName);
        usedSlots.add(m.colorSlot);
      }
    }

    const displayName = assignUniqueDisplayName(baseName, existingNames);
    const colorSlot = this.pickColorSlot(usedSlots, groupSet.size);

    const device: ConnectedDevice = {
      deviceId: effectiveDeviceId,
      sessionToken: params.sessionToken,
      baseName,
      displayName,
      kind,
      groupId: params.groupId,
      source: params.source,
      colorSlot,
      clientIp: params.clientIp,
      ws: params.ws,
      lastHeartbeatAt: nowMs,
      busy: false,
    };

    this.devices.set(device.deviceId, device);
    groupSet.add(device.deviceId);
    this.groups.set(params.groupId, groupSet);
    this.broadcastGroup(params.groupId);

    return { ok: true, device };
  }

  private pickColorSlot(usedSlots: Set<ColorSlot>, index: number): ColorSlot {
    const allSlots: ColorSlot[] = [1, 2, 3, 4];
    for (const s of allSlots) {
      if (!usedSlots.has(s)) return s;
    }
    return allSlots[index % 4]!;
  }

  moveDeviceToGroup(
    deviceId: string,
    targetGroupId: string,
    source: GroupSource
  ): { ok: true; device: ConnectedDevice } | { ok: false; reason: 'group_full' | 'not_found' } {
    const dev = this.devices.get(deviceId);
    if (!dev) return { ok: false, reason: 'not_found' };
    if (dev.groupId === targetGroupId) {
      dev.source = source;
      this.broadcastGroup(targetGroupId);
      return { ok: true, device: dev };
    }

    const targetSet = this.groups.get(targetGroupId) ?? new Set<string>();
    if (targetSet.size >= GROUP_MAX_DEVICES) {
      return { ok: false, reason: 'group_full' };
    }

    const oldGroupId = dev.groupId;
    const oldSet = this.groups.get(oldGroupId);
    if (oldSet) {
      oldSet.delete(deviceId);
      if (oldSet.size === 0) this.groups.delete(oldGroupId);
      else this.broadcastGroup(oldGroupId);
    }

    const existingNames: string[] = [];
    const usedSlots = new Set<ColorSlot>();
    for (const memberId of targetSet) {
      const m = this.devices.get(memberId);
      if (m) {
        existingNames.push(m.displayName);
        usedSlots.add(m.colorSlot);
      }
    }

    dev.groupId = targetGroupId;
    dev.source = source;
    dev.displayName = assignUniqueDisplayName(dev.baseName, existingNames);
    dev.colorSlot = this.pickColorSlot(usedSlots, targetSet.size);

    targetSet.add(deviceId);
    this.groups.set(targetGroupId, targetSet);
    this.broadcastGroup(targetGroupId);

    return { ok: true, device: dev };
  }

  touchHeartbeat(deviceId: string, nowMs: number = Date.now()): void {
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.lastHeartbeatAt = nowMs;
    }
  }

  markSocketClosed(deviceId: string, ws: WebSocket, nowMs: number = Date.now()): void {
    const dev = this.devices.get(deviceId);
    if (dev && dev.ws === ws) {
      dev.ws = null;
      dev.lastHeartbeatAt = nowMs;
    }
  }

  setBusy(deviceId: string, busy: boolean): void {
    const dev = this.devices.get(deviceId);
    if (dev && dev.busy !== busy) {
      dev.busy = busy;
      this.broadcastGroup(dev.groupId);
    }
  }

  getDevice(deviceId: string): ConnectedDevice | undefined {
    return this.devices.get(deviceId);
  }

  toPeerInfo(dev: ConnectedDevice): PeerInfo {
    return {
      deviceId: dev.deviceId,
      displayName: dev.displayName,
      kind: dev.kind,
      colorSlot: dev.colorSlot,
      source: dev.source,
      busy: dev.busy,
    };
  }

  getPeersFor(deviceId: string): PeerInfo[] {
    const dev = this.devices.get(deviceId);
    if (!dev) return [];
    const groupSet = this.groups.get(dev.groupId);
    if (!groupSet) return [];
    const peers: PeerInfo[] = [];
    for (const memberId of groupSet) {
      if (memberId === deviceId) continue;
      const m = this.devices.get(memberId);
      if (m) {
        peers.push(this.toPeerInfo(m));
      }
    }
    return peers;
  }

  sendTo(deviceId: string, msg: ServerMessage): boolean {
    const dev = this.devices.get(deviceId);
    if (!dev || !dev.ws || dev.ws.readyState !== 1) return false;
    dev.ws.send(JSON.stringify(msg));
    return true;
  }

  broadcastGroup(groupId: string): void {
    const groupSet = this.groups.get(groupId);
    if (!groupSet) return;
    for (const memberId of groupSet) {
      const peers = this.getPeersFor(memberId);
      this.sendTo(memberId, { type: 'peers:update', peers });
    }
  }

  removeDevice(deviceId: string): void {
    const dev = this.devices.get(deviceId);
    if (!dev) return;
    this.devices.delete(deviceId);
    const groupSet = this.groups.get(dev.groupId);
    if (groupSet) {
      groupSet.delete(deviceId);
      if (groupSet.size === 0) {
        this.groups.delete(dev.groupId);
      } else {
        this.broadcastGroup(dev.groupId);
      }
    }
  }

  /**
   * Menghapus device yang tidak mengirim heartbeat selama > 15 detik (PRD FR1.4).
   * Mengembalikan daftar deviceId yang terputus.
   */
  pruneStaleDevices(nowMs: number = Date.now()): string[] {
    const removed: string[] = [];
    for (const [deviceId, dev] of this.devices) {
      // Jika socket masih terbuka (readyState === 1), kirim ping dan perbarui heartbeat
      if (dev.ws && dev.ws.readyState === 1) {
        try {
          dev.ws.ping();
        } catch {
          // abaikan
        }
        if (nowMs - dev.lastHeartbeatAt <= OFFLINE_TIMEOUT_MS * 2) {
          continue;
        }
      }
      if (nowMs - dev.lastHeartbeatAt > OFFLINE_TIMEOUT_MS) {
        if (dev.ws) {
          try {
            dev.ws.close();
          } catch {
            // abaikan
          }
        }
        this.removeDevice(deviceId);
        removed.push(deviceId);
      }
    }
    return removed;
  }
}
