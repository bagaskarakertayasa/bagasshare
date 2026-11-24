import { randomUUID } from 'node:crypto';
import {
  TRANSFER_REQUEST_TIMEOUT_MS,
  validateTransferFiles,
  type TransferFileMeta,
} from '@bagas-share/shared';
import type { GroupManager } from './group-manager.js';
import type { StateDatabase } from './db.js';

export interface ActiveTransfer {
  transferId: string;
  senderDeviceId: string;
  senderIp: string;
  receiverDeviceId: string;
  groupId: string;
  files: TransferFileMeta[];
  status: 'pending' | 'accepted' | 'completed' | 'terminated';
  createdAt: number;
  expiresAt: number;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

export class TransferManager {
  private transfers = new Map<string, ActiveTransfer>();

  constructor(
    private groups: GroupManager,
    private db: StateDatabase
  ) {}

  createTransferRequest(params: {
    senderDeviceId: string;
    targetDeviceId: string;
    files: TransferFileMeta[];
    resumeTransferId?: string;
    nowMs?: number;
  }): void {
    const nowMs = params.nowMs ?? Date.now();
    const sender = this.groups.getDevice(params.senderDeviceId);
    const receiver = this.groups.getDevice(params.targetDeviceId);

    if (!sender || !receiver || sender.groupId !== receiver.groupId) {
      this.groups.sendTo(params.senderDeviceId, {
        type: 'transfer:status',
        transferId: params.resumeTransferId || 'unknown',
        status: 'cancelled',
        message: 'Perangkat tujuan tidak ditemukan di grup yang sama.',
      });
      return;
    }

    // M3: Validasi kepemilikan resumeTransferId sebelum melewati cek busy atau menimpa transfer yang ada
    const existingForResume = params.resumeTransferId
      ? this.transfers.get(params.resumeTransferId)
      : undefined;
    const isValidResumeOwner =
      existingForResume !== undefined &&
      existingForResume.senderDeviceId === sender.deviceId &&
      existingForResume.receiverDeviceId === receiver.deviceId;

    if (receiver.busy && !isValidResumeOwner) {
      this.groups.sendTo(sender.deviceId, {
        type: 'transfer:status',
        transferId: 'busy',
        status: 'busy',
      });
      return;
    }

    const quota = this.db.getQuotaStatus(sender.clientIp, nowMs);
    const validation = validateTransferFiles(params.files, quota.remaining);
    if (!validation.valid) {
      this.groups.sendTo(sender.deviceId, {
        type: 'transfer:status',
        transferId: 'invalid',
        status: validation.exceedsQuota ? 'quota_exceeded' : 'invalid_files',
      });
      return;
    }

    // Jika resumeTransferId milik transfer orang lain, jangan timpa — buat transferId baru
    const transferId =
      params.resumeTransferId && (!existingForResume || isValidResumeOwner)
        ? params.resumeTransferId
        : randomUUID();
    const expiresAt = nowMs + TRANSFER_REQUEST_TIMEOUT_MS;

    if (isValidResumeOwner && existingForResume?.timeoutHandle) {
      clearTimeout(existingForResume.timeoutHandle);
    }

    const timeoutHandle = setTimeout(() => {
      this.expireTransfer(transferId);
    }, TRANSFER_REQUEST_TIMEOUT_MS);

    const record: ActiveTransfer = {
      transferId,
      senderDeviceId: sender.deviceId,
      senderIp: sender.clientIp,
      receiverDeviceId: receiver.deviceId,
      groupId: sender.groupId,
      files: params.files,
      status: 'pending',
      createdAt: nowMs,
      expiresAt,
      timeoutHandle,
    };

    this.transfers.set(transferId, record);
    this.groups.setBusy(sender.deviceId, true);
    this.groups.setBusy(receiver.deviceId, true);

    const expiresAtIso = new Date(expiresAt).toISOString();
    this.groups.sendTo(sender.deviceId, {
      type: 'transfer:created',
      transferId,
      expiresAt: expiresAtIso,
    });

    this.groups.sendTo(receiver.deviceId, {
      type: 'transfer:incoming',
      transferId,
      from: this.groups.toPeerInfo(sender),
      expiresAt: expiresAtIso,
      isResume: Boolean(params.resumeTransferId),
      files: params.files,
    });
  }

  respondToTransfer(
    responderDeviceId: string,
    transferId: string,
    accept: boolean,
    reason?: 'rejected' | 'busy'
  ): void {
    const tr = this.transfers.get(transferId);
    if (!tr || tr.receiverDeviceId !== responderDeviceId || tr.status !== 'pending') {
      return;
    }
    if (tr.timeoutHandle) {
      clearTimeout(tr.timeoutHandle);
      tr.timeoutHandle = undefined;
    }

    if (accept) {
      tr.status = 'accepted';
      this.groups.sendTo(tr.senderDeviceId, {
        type: 'transfer:status',
        transferId,
        status: 'accepted',
      });
    } else {
      tr.status = 'terminated';
      this.groups.setBusy(tr.senderDeviceId, false);
      this.groups.setBusy(tr.receiverDeviceId, false);
      this.groups.sendTo(tr.senderDeviceId, {
        type: 'transfer:status',
        transferId,
        status: reason === 'busy' ? 'busy' : 'rejected',
      });
      this.transfers.delete(transferId);
    }
  }

  cancelTransfer(actorDeviceId: string, transferId: string): void {
    const tr = this.transfers.get(transferId);
    if (!tr) return;
    if (actorDeviceId !== tr.senderDeviceId && actorDeviceId !== tr.receiverDeviceId) {
      return;
    }
    if (tr.timeoutHandle) {
      clearTimeout(tr.timeoutHandle);
      tr.timeoutHandle = undefined;
    }
    tr.status = 'terminated';
    this.groups.setBusy(tr.senderDeviceId, false);
    this.groups.setBusy(tr.receiverDeviceId, false);

    const otherId =
      actorDeviceId === tr.senderDeviceId ? tr.receiverDeviceId : tr.senderDeviceId;
    this.groups.sendTo(otherId, {
      type: 'transfer:status',
      transferId,
      status: 'cancelled',
    });
    this.transfers.delete(transferId);
  }

  completeTransfer(
    receiverDeviceId: string,
    transferId: string,
    filesReceived: number,
    nowMs: number = Date.now()
  ): void {
    const tr = this.transfers.get(transferId);
    if (!tr || tr.receiverDeviceId !== receiverDeviceId) return;
    if (tr.timeoutHandle) {
      clearTimeout(tr.timeoutHandle);
      tr.timeoutHandle = undefined;
    }
    tr.status = 'completed';
    this.groups.setBusy(tr.senderDeviceId, false);
    this.groups.setBusy(tr.receiverDeviceId, false);

    const count = Math.min(tr.files.length, Math.max(1, filesReceived));
    const quota = this.db.incrementFilesReceived(tr.senderIp, count, nowMs);

    this.groups.sendTo(tr.senderDeviceId, {
      type: 'transfer:status',
      transferId,
      status: 'completed',
    });
    this.groups.sendTo(tr.senderDeviceId, {
      type: 'quota:update',
      quotaRemaining: quota.remaining,
      quotaResetAt: quota.resetAt,
    });
    this.transfers.delete(transferId);
  }

  relayRtcSignal(params: {
    fromDeviceId: string;
    targetDeviceId: string;
    transferId: string;
    sdp?: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string };
    ice?: {
      candidate?: string;
      sdpMid?: string | null;
      sdpMLineIndex?: number | null;
      usernameFragment?: string | null;
    };
  }): void {
    const tr = this.transfers.get(params.transferId);
    if (!tr || tr.status !== 'accepted') return;
    const isParticipant =
      (params.fromDeviceId === tr.senderDeviceId &&
        params.targetDeviceId === tr.receiverDeviceId) ||
      (params.fromDeviceId === tr.receiverDeviceId &&
        params.targetDeviceId === tr.senderDeviceId);
    if (!isParticipant) return;

    this.groups.sendTo(params.targetDeviceId, {
      type: 'rtc:signal',
      transferId: params.transferId,
      fromDeviceId: params.fromDeviceId,
      sdp: params.sdp,
      ice: params.ice,
    });
  }

  private expireTransfer(transferId: string): void {
    const tr = this.transfers.get(transferId);
    if (!tr || tr.status !== 'pending') return;
    tr.status = 'terminated';
    this.groups.setBusy(tr.senderDeviceId, false);
    this.groups.setBusy(tr.receiverDeviceId, false);
    this.groups.sendTo(tr.senderDeviceId, {
      type: 'transfer:status',
      transferId,
      status: 'expired',
    });
    this.groups.sendTo(tr.receiverDeviceId, {
      type: 'transfer:status',
      transferId,
      status: 'expired',
    });
    this.transfers.delete(transferId);
  }

  handleDeviceRemoved(deviceId: string): void {
    for (const [transferId, tr] of this.transfers) {
      if (tr.senderDeviceId === deviceId || tr.receiverDeviceId === deviceId) {
        if (tr.timeoutHandle) clearTimeout(tr.timeoutHandle);
        const otherId =
          deviceId === tr.senderDeviceId ? tr.receiverDeviceId : tr.senderDeviceId;
        this.groups.setBusy(otherId, false);
        this.transfers.delete(transferId);
      }
    }
  }
}
