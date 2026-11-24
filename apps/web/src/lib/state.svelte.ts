import {
  DAILY_FILE_QUOTA,
  LINK_DAILY_QUOTA_PER_IP,
  MAX_FILE_SIZE_BYTES,
  validateTransferFiles,
  type ColorSlot,
  type PairErrorReason,
  type PeerInfo,
  type ServerMessage,
  type TransferFileMeta,
} from '@bagas-share/shared';
import {
  getInitialLocale,
  saveLocale,
  translate,
  type Locale,
  type TranslationKey,
} from './i18n/index.js';
import { computeFileSha256Hex } from './hash.js';
import { deleteStoredFile } from './idb-resume.js';
import { SignalingClient, setSessionPairToken } from './signaling.js';
import { WebRtcTransferSession, type SenderFileItem } from './webrtc.js';
import { uploadFileToCloudflareR2 } from './cloud-upload.js';
import {
  copyTextToClipboard,
  downloadCloudLink,
  triggerBrowserDownload,
} from './download.js';
import {
  loadInterruptedTransfers,
  writeSenderResumeSession,
  type PendingSenderResume,
} from './resume-session.js';

export type { PendingSenderResume };

export type TransferRowState =
  | 'waiting_approval'
  | 'connecting'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'busy'
  | 'failed_p2p'
  | 'failed_checksum'
  | 'failed_storage'
  | 'cancelled';

export interface TransferFileRow {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  bytesTransferred: number;
  status: 'waiting' | 'transferring' | 'done' | 'failed';
  downloadUrl?: string;
  downloaded?: boolean;
  cloudLinkId?: string;
  cloudShareUrl?: string;
  copied?: boolean;
}

export interface TransferRowItem {
  transferId: string;
  role: 'sender' | 'receiver';
  peerDeviceId: string;
  peerDisplayName: string;
  peerColorSlot: ColorSlot;
  state: TransferRowState;
  expiresAtMs?: number;
  files: TransferFileRow[];
}

export interface ComposerCandidateFile {
  fileId: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  issue?: 'empty' | 'too_large' | 'blocked_extension';
  blockedExtension?: string;
}

export interface ToastItem {
  id: string;
  kind: 'info' | 'error';
  message: string;
  persistent?: boolean;
}

class AppState {
  locale = $state<Locale>(getInitialLocale());
  webrtcSupported = $state<boolean>(
    typeof window !== 'undefined' &&
      typeof RTCPeerConnection !== 'undefined' &&
      typeof WebSocket !== 'undefined'
  );
  isNotFoundRoute = $state<boolean>(
    typeof window !== 'undefined' &&
      window.location.pathname !== '/' &&
      window.location.pathname !== '/index.html' &&
      !window.location.pathname.startsWith('/d/')
  );
  downloadLinkId = $state<string | null>(
    typeof window !== 'undefined' && window.location.pathname.startsWith('/d/')
      ? window.location.pathname.slice(3).split('/')[0] || null
      : null
  );

  // Koneksi & Identitas
  connectionState = $state<'connecting' | 'connected' | 'disconnected'>('connecting');
  browserOffline = $state<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  selfDeviceId = $state<string>('');
  selfDisplayName = $state<string>('');

  // Kuota Harian
  quotaRemaining = $state<number>(DAILY_FILE_QUOTA);
  linkQuotaRemaining = $state<number>(LINK_DAILY_QUOTA_PER_IP);

  // Daftar Peer
  peers = $state<PeerInfo[]>([]);
  liveAnnouncement = $state<string>('');

  // Composer (S2)
  composerOpen = $state<boolean>(false);
  composerTarget = $state<PeerInfo | null>(null);
  composerFiles = $state<ComposerCandidateFile[]>([]);
  composerHashing = $state<boolean>(false);

  // Permintaan Masuk (S3)
  incomingRequest = $state<{
    transferId: string;
    from: PeerInfo;
    expiresAtMs: number;
    status: 'active' | 'expired' | 'cancelled';
    files: TransferFileMeta[];
  } | null>(null);

  // Panel Transfer (S4)
  transfers = $state<TransferRowItem[]>([]);

  // Pairing Dialog (S5)
  pairingOpen = $state<boolean>(false);
  pairingTab = $state<'create' | 'enter'>('create');
  pairingLoading = $state<boolean>(false);
  createdPairingCode = $state<{ code: string; expiresAt: string } | null>(null);
  pairingError = $state<{
    reason: PairErrorReason;
    retryAfterSec?: number;
  } | null>(null);

  // Resume setelah refresh (S6)
  pendingSenderResume = $state<PendingSenderResume | null>(null);

  // Toast (S7)
  toasts = $state<ToastItem[]>([]);

  // Countdown tick (1 dtk)
  nowMs = $state<number>(Date.now());

  private signaling: SignalingClient | null = null;
  private sessions = new Map<string, WebRtcTransferSession>();
  private senderRawFiles = new Map<string, SenderFileItem[]>();

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    return translate(this.locale, key, params);
  }

  setLocale(next: Locale): void {
    this.locale = next;
    saveLocale(next);
  }

  init(): void {
    saveLocale(this.locale);
    this.fetchLinkQuota();
    if (!this.webrtcSupported || this.isNotFoundRoute || this.downloadLinkId) return;

    window.addEventListener('online', () => {
      this.browserOffline = false;
    });
    window.addEventListener('offline', () => {
      this.browserOffline = true;
    });

    setInterval(() => {
      this.nowMs = Date.now();
    }, 1_000);

    this.restoreInterruptedTransfers();

    this.signaling = new SignalingClient({
      onOpen: () => {
        this.connectionState = 'connected';
      },
      onClose: () => {
        if (this.connectionState !== 'connecting') {
          this.connectionState = 'disconnected';
        }
      },
      onMessage: (msg) => this.handleServerMessage(msg),
    });
    this.signaling.connect();
  }

  private async restoreInterruptedTransfers(): Promise<void> {
    const { senderResume, receiverTransfers } = await loadInterruptedTransfers();
    if (senderResume) {
      this.pendingSenderResume = senderResume;
    }
    for (const rt of receiverTransfers) {
      this.transfers.unshift({
        transferId: rt.transferId,
        role: 'receiver',
        peerDeviceId: rt.peerDeviceId,
        peerDisplayName: rt.peerDisplayName,
        peerColorSlot: 1,
        state: 'paused',
        files: rt.files.map((f) => ({
          ...f,
          status: 'transferring',
        })),
      });
    }
  }

  private saveSenderResumeSession(
    data: PendingSenderResume | null,
    showBanner = false
  ): void {
    if (!data || showBanner) {
      this.pendingSenderResume = data;
    }
    writeSenderResumeSession(data);
  }

  reconnectNow(): void {
    this.connectionState = 'connecting';
    this.signaling?.reconnectNow();
  }

  addToast(message: string, kind: 'info' | 'error' = 'info', persistent = false): void {
    const id = Math.random().toString(36).slice(2, 10);
    this.toasts.push({ id, kind, message, persistent });
    if (!persistent) {
      setTimeout(() => {
        this.dismissToast(id);
      }, 6_000);
    }
  }

  dismissToast(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome': {
        this.connectionState = 'connected';
        this.selfDeviceId = msg.deviceId;
        this.selfDisplayName = msg.displayName;
        this.quotaRemaining = msg.quotaRemaining;
        break;
      }

      case 'group:full': {
        this.peers = [];
        this.addToast(this.t('toastGroupFull'), 'error', true);
        break;
      }

      case 'peers:update': {
        const oldIds = new Set(this.peers.map((p) => p.deviceId));
        const newIds = new Set(msg.peers.map((p) => p.deviceId));

        for (const p of msg.peers) {
          if (!oldIds.has(p.deviceId) && this.selfDeviceId) {
            this.liveAnnouncement = this.t('peerJoinedAria', { name: p.displayName });
          }
        }
        for (const old of this.peers) {
          if (!newIds.has(old.deviceId)) {
            this.liveAnnouncement = this.t('peerLeftAria', { name: old.displayName });
          }
        }
        this.peers = msg.peers;
        break;
      }

      case 'pair:created': {
        this.pairingLoading = false;
        this.pairingError = null;
        this.createdPairingCode = {
          code: msg.code,
          expiresAt: msg.expiresAt,
        };
        setSessionPairToken(msg.pairToken);
        break;
      }

      case 'pair:joined': {
        this.pairingLoading = false;
        this.pairingError = null;
        setSessionPairToken(msg.pairToken);
        this.pairingOpen = false;
        break;
      }

      case 'pair:error': {
        this.pairingLoading = false;
        this.pairingError = {
          reason: msg.reason,
          retryAfterSec: msg.retryAfterSec,
        };
        break;
      }

      case 'transfer:created': {
        const row = this.transfers.find((r) => r.transferId === 'pending_local');
        if (row) {
          row.transferId = msg.transferId;
          row.expiresAtMs = new Date(msg.expiresAt).getTime();
          const rawFiles = this.senderRawFiles.get('pending_local');
          if (rawFiles) {
            this.senderRawFiles.delete('pending_local');
            this.senderRawFiles.set(msg.transferId, rawFiles);
            this.saveSenderResumeSession({
              transferId: msg.transferId,
              targetDeviceId: row.peerDeviceId,
              targetDisplayName: row.peerDisplayName,
              targetColorSlot: row.peerColorSlot,
              files: rawFiles.map((f) => f.meta),
            });
          }
        }
        break;
      }

      case 'transfer:incoming': {
        const existingPaused = this.transfers.find(
          (t) =>
            t.role === 'receiver' &&
            t.state === 'paused' &&
            t.files.some((f) => msg.files.some((mf) => mf.sha256 === f.sha256))
        );
        if (msg.isResume && existingPaused) {
          existingPaused.transferId = msg.transferId;
          existingPaused.peerDeviceId = msg.from.deviceId;
          existingPaused.peerDisplayName = msg.from.displayName;
          existingPaused.peerColorSlot = msg.from.colorSlot;
          existingPaused.state = 'connecting';
          this.startReceiverRtc(msg.transferId, msg.from, msg.files);
          this.signaling?.send({
            type: 'transfer:respond',
            transferId: msg.transferId,
            accept: true,
          });
          return;
        }

        this.incomingRequest = {
          transferId: msg.transferId,
          from: msg.from,
          expiresAtMs: new Date(msg.expiresAt).getTime(),
          status: 'active',
          files: msg.files,
        };
        document.title = this.t('incomingTitleTab');
        break;
      }

      case 'transfer:status': {
        const row =
          this.transfers.find((r) => r.transferId === msg.transferId) ??
          this.transfers.find((r) => r.transferId === 'pending_local');

        if (msg.status === 'accepted' && row && row.role === 'sender') {
          row.state = 'connecting';
          const senderFiles = this.senderRawFiles.get(row.transferId) ?? [];
          if (senderFiles.length > 0) {
            this.startSenderRtc(row, senderFiles);
          }
        } else if (msg.status === 'rejected' && row) {
          row.state = 'rejected';
          this.saveSenderResumeSession(null);
        } else if (msg.status === 'expired') {
          if (row) row.state = 'expired';
          if (this.incomingRequest?.transferId === msg.transferId) {
            this.incomingRequest.status = 'expired';
            document.title = this.t('appName');
          }
          this.saveSenderResumeSession(null);
        } else if (msg.status === 'busy' && row) {
          row.state = 'busy';
          this.saveSenderResumeSession(null);
        } else if (msg.status === 'cancelled') {
          if (row) row.state = 'cancelled';
          if (this.incomingRequest?.transferId === msg.transferId) {
            this.incomingRequest.status = 'cancelled';
            document.title = this.t('appName');
          }
          this.sessions.get(msg.transferId)?.close();
          this.sessions.delete(msg.transferId);
          this.saveSenderResumeSession(null);
        } else if (msg.status === 'completed' && row) {
          row.state = 'completed';
          this.saveSenderResumeSession(null);
        } else if (msg.status === 'quota_exceeded' && row) {
          row.state = 'cancelled';
          this.quotaRemaining = 0;
          this.saveSenderResumeSession(null);
        }
        break;
      }

      case 'rtc:signal': {
        this.sessions
          .get(msg.transferId)
          ?.handleSignal({ sdp: msg.sdp, ice: msg.ice });
        break;
      }

      case 'quota:update': {
        this.quotaRemaining = msg.quotaRemaining;
        break;
      }
    }
  }

  // Composer Actions (S2)
  openComposerWithFiles(
    peer: PeerInfo | null,
    fileList: FileList | File[]
  ): void {
    if (peer && (this.quotaRemaining <= 0 || peer.busy)) return;
    this.fetchLinkQuota();
    this.composerTarget = peer;
    this.composerOpen = true;
    this.composerFiles = [];
    this.addFilesToComposer(fileList);
  }

  addFilesToComposer(fileList: FileList | File[]): void {
    for (const f of Array.from(fileList)) {
      const fileId = Math.random().toString(36).slice(2, 10);
      const check = validateTransferFiles(
        [{ fileId, name: f.name, size: f.size }],
        DAILY_FILE_QUOTA
      );
      const issue = check.fileIssues[0];
      this.composerFiles.push({
        fileId,
        file: f,
        name: f.name,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
        issue: issue?.reason,
        blockedExtension: issue?.blockedExtension,
      });
    }
  }

  removeComposerFile(fileId: string): void {
    this.composerFiles = this.composerFiles.filter((f) => f.fileId !== fileId);
    if (this.composerFiles.length === 0) {
      this.closeComposer();
    }
  }

  closeComposer(): void {
    this.composerOpen = false;
    this.composerTarget = null;
    this.composerFiles = [];
  }

  async confirmComposerSend(): Promise<void> {
    const target = this.composerTarget;
    if (!this.composerOpen || this.composerHashing) return;
    const validCandidates = this.composerFiles.filter((f) => !f.issue);
    if (validCandidates.length === 0) return;

    const p2pCandidates = validCandidates.filter(
      (c) => c.size <= MAX_FILE_SIZE_BYTES
    );
    const cloudCandidates = validCandidates.filter(
      (c) => c.size > MAX_FILE_SIZE_BYTES
    );

    if (!target && p2pCandidates.length > 0) {
      this.addToast(this.t('errBelow500WithoutPeer'), 'error');
      return;
    }

    this.composerHashing = true;
    try {
      this.closeComposer();

      if (cloudCandidates.length > 0) {
        const cloudTransferId =
          'cloud_' + Math.random().toString(36).slice(2, 10);
        const cloudItems: SenderFileItem[] = cloudCandidates.map((c) => ({
          file: c.file,
          meta: {
            fileId: c.fileId,
            name: c.name,
            size: c.size,
            mimeType: c.mimeType,
            sha256: 'cloud-r2-' + c.fileId,
          },
        }));

        this.transfers.unshift({
          transferId: cloudTransferId,
          role: 'sender',
          peerDeviceId: target ? target.deviceId : '',
          peerDisplayName: target
            ? target.displayName
            : this.t('cloudLinkRowPeerName'),
          peerColorSlot: target ? target.colorSlot : 4,
          state: 'transferring',
          files: cloudItems.map((s) => ({
            ...s.meta,
            bytesTransferred: 0,
            status: 'transferring',
          })),
        });
        this.runCloudFilesUpload(this.transfers[0]!, cloudItems);
      }

      if (target && p2pCandidates.length > 0) {
        const senderItems: SenderFileItem[] = [];
        for (const c of p2pCandidates) {
          const sha256 = await computeFileSha256Hex(c.file);
          senderItems.push({
            file: c.file,
            meta: {
              fileId: c.fileId,
              name: c.name,
              size: c.size,
              mimeType: c.mimeType,
              sha256,
            },
          });
        }

        this.transfers.unshift({
          transferId: 'pending_local',
          role: 'sender',
          peerDeviceId: target.deviceId,
          peerDisplayName: target.displayName,
          peerColorSlot: target.colorSlot,
          state: 'waiting_approval',
          expiresAtMs: Date.now() + 60_000,
          files: senderItems.map((s) => ({
            ...s.meta,
            bytesTransferred: 0,
            status: 'waiting',
          })),
        });
        this.senderRawFiles.set('pending_local', senderItems);

        this.signaling?.send({
          type: 'transfer:request',
          targetDeviceId: target.deviceId,
          files: senderItems.map((s) => s.meta),
        });
      }
    } finally {
      this.composerHashing = false;
    }
  }

  // Resume oleh pengirim setelah refresh (FR10.3)
  async handleSenderResumeFilesSelected(fileList: FileList | null): Promise<void> {
    const resume = this.pendingSenderResume;
    if (!resume || !fileList || fileList.length === 0) return;

    const chosen = Array.from(fileList);
    const matchedItems: SenderFileItem[] = [];

    for (const expected of resume.files) {
      const candidate = chosen.find(
        (f) => f.name === expected.name && f.size === expected.size
      );
      if (!candidate) {
        this.addToast(this.t('resumeMismatchErr'), 'error');
        return;
      }
      const sha = await computeFileSha256Hex(candidate);
      if (sha !== expected.sha256) {
        this.addToast(this.t('resumeMismatchErr'), 'error');
        return;
      }
      matchedItems.push({ file: candidate, meta: expected });
    }

    this.transfers = this.transfers.filter((t) => t.transferId !== resume.transferId);
    this.transfers.unshift({
      transferId: resume.transferId,
      role: 'sender',
      peerDeviceId: resume.targetDeviceId,
      peerDisplayName: resume.targetDisplayName,
      peerColorSlot: resume.targetColorSlot,
      state: 'waiting_approval',
      expiresAtMs: Date.now() + 60_000,
      files: matchedItems.map((m) => ({
        ...m.meta,
        bytesTransferred: 0,
        status: 'waiting',
      })),
    });
    this.senderRawFiles.set(resume.transferId, matchedItems);
    this.pendingSenderResume = null;

    this.signaling?.send({
      type: 'transfer:request',
      targetDeviceId: resume.targetDeviceId,
      resumeTransferId: resume.transferId,
      files: matchedItems.map((m) => m.meta),
    });
  }

  dismissSenderResumeBanner(): void {
    this.saveSenderResumeSession(null);
  }

  // Incoming Request Actions (S3)
  acceptIncoming(): void {
    const req = this.incomingRequest;
    if (!req || req.status !== 'active') return;
    document.title = this.t('appName');

    this.transfers.unshift({
      transferId: req.transferId,
      role: 'receiver',
      peerDeviceId: req.from.deviceId,
      peerDisplayName: req.from.displayName,
      peerColorSlot: req.from.colorSlot,
      state: 'connecting',
      files: req.files.map((f) => ({
        ...f,
        bytesTransferred: 0,
        status: 'waiting',
      })),
    });
    this.incomingRequest = null;

    const p2pFiles = req.files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    if (p2pFiles.length > 0) {
      this.startReceiverRtc(req.transferId, req.from, p2pFiles);
    }
    this.signaling?.send({
      type: 'transfer:respond',
      transferId: req.transferId,
      accept: true,
    });
  }

  rejectIncoming(): void {
    const req = this.incomingRequest;
    if (!req) return;
    document.title = this.t('appName');
    if (req.status === 'active') {
      this.signaling?.send({
        type: 'transfer:respond',
        transferId: req.transferId,
        accept: false,
        reason: 'rejected',
      });
    }
    this.incomingRequest = null;
  }

  private async runCloudFilesUpload(
    row: TransferRowItem,
    cloudFiles: SenderFileItem[]
  ): Promise<void> {
    row.state = 'transferring';
    const isCancelled = () => row.state === 'cancelled';

    for (const item of cloudFiles) {
      if (isCancelled()) return;
      const fRow = row.files.find((x) => x.fileId === item.meta.fileId);
      if (fRow) fRow.status = 'transferring';

      const res = await uploadFileToCloudflareR2({
        file: item.file,
        isCancelled,
        onProgress: (bytesUploaded) => {
          if (fRow) fRow.bytesTransferred = bytesUploaded;
        },
      });

      if (!res) return; // dibatalkan

      if (!res.ok) {
        if (res.error === 'r2_not_configured') {
          this.addToast(this.t('linkErrNotConfigured'), 'error');
        } else if (res.error === 'quota_exceeded') {
          this.addToast(this.t('linkErrQuota'), 'error');
        } else {
          this.addToast(this.t('linkErrUploadFailed'), 'error');
        }
        if (fRow) fRow.status = 'failed';
        row.state = 'failed_p2p';
        return;
      }

      if (typeof res.quotaRemaining === 'number') {
        this.linkQuotaRemaining = res.quotaRemaining;
      }
      if (fRow) {
        fRow.bytesTransferred = item.file.size;
        fRow.status = 'done';
        fRow.cloudLinkId = res.linkId;
        fRow.cloudShareUrl = res.shareUrl;
      }
    }

    if (row.files.every((x) => x.status === 'done')) {
      row.state = 'completed';
      this.saveSenderResumeSession(null);
    }
  }

  private startSenderRtc(
    row: TransferRowItem,
    senderFiles: SenderFileItem[]
  ): void {
    const p2pMeta = row.files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    const sess = new WebRtcTransferSession(
      row.transferId,
      'sender',
      p2pMeta,
      senderFiles,
      this.selfDeviceId,
      this.selfDisplayName,
      {
        sendSignal: (payload) => {
          this.signaling?.send({
            type: 'rtc:signal',
            transferId: row.transferId,
            targetDeviceId: row.peerDeviceId,
            sdp: payload.sdp,
            ice: payload.ice,
          });
        },
        onConnected: () => {
          row.state = 'transferring';
        },
        onDisconnected: () => {
          if (row.state === 'transferring') row.state = 'paused';
        },
        onFailedP2P: () => {
          row.state = 'failed_p2p';
        },
        onFailedChecksum: () => {
          row.state = 'failed_checksum';
        },
        onFailedStorage: () => {
          row.state = 'failed_storage';
        },
        onFileProgress: (fileId, sent) => {
          const f = row.files.find((x) => x.fileId === fileId);
          if (f) {
            f.bytesTransferred = sent;
            f.status = sent >= f.size ? 'done' : 'transferring';
          }
        },
        onFileDoneReceiver: () => {},
        onAllDone: () => {
          if (row.files.every((x) => x.status === 'done')) {
            row.state = 'completed';
            this.saveSenderResumeSession(null);
          }
        },
      }
    );
    this.sessions.set(row.transferId, sess);
    sess.startAsSender();
  }

  private startReceiverRtc(
    transferId: string,
    from: PeerInfo,
    filesMeta: TransferFileMeta[]
  ): void {
    const row = this.transfers.find((r) => r.transferId === transferId);
    if (!row) return;

    const sess = new WebRtcTransferSession(
      transferId,
      'receiver',
      filesMeta,
      [],
      from.deviceId,
      from.displayName,
      {
        sendSignal: (payload) => {
          this.signaling?.send({
            type: 'rtc:signal',
            transferId,
            targetDeviceId: from.deviceId,
            sdp: payload.sdp,
            ice: payload.ice,
          });
        },
        onConnected: () => {
          row.state = 'transferring';
        },
        onDisconnected: () => {
          if (row.state === 'transferring') row.state = 'paused';
        },
        onFailedP2P: () => {
          row.state = 'failed_p2p';
        },
        onFailedChecksum: () => {
          row.state = 'failed_checksum';
        },
        onFailedStorage: () => {
          row.state = 'failed_storage';
        },
        onFileProgress: (fileId, sent) => {
          const f = row.files.find((x) => x.fileId === fileId);
          if (f) {
            f.bytesTransferred = sent;
            f.status = 'transferring';
          }
        },
        onFileDoneReceiver: (fileId, blob) => {
          const f = row.files.find((x) => x.fileId === fileId);
          if (f) {
            f.bytesTransferred = f.size;
            f.status = 'done';
            f.downloadUrl = URL.createObjectURL(blob);
          }
        },
        onAllDone: (filesCount) => {
          if (row.files.every((x) => x.status === 'done')) {
            row.state = 'completed';
            this.signaling?.send({
              type: 'transfer:complete',
              transferId,
              filesReceived: row.files.length,
            });
          } else {
            this.signaling?.send({
              type: 'transfer:complete',
              transferId,
              filesReceived: filesCount,
            });
          }
        },
      }
    );
    this.sessions.set(transferId, sess);
    sess.startAsReceiver();
  }

  cancelTransferRow(transferId: string): void {
    const row = this.transfers.find((r) => r.transferId === transferId);
    if (!row) return;
    row.state = 'cancelled';
    this.sessions.get(transferId)?.close();
    this.sessions.delete(transferId);
    this.saveSenderResumeSession(null);

    if (row.role === 'receiver') {
      for (const f of row.files) {
        deleteStoredFile(f.sha256);
      }
    }

    if (transferId !== 'pending_local' && !transferId.startsWith('cloud_')) {
      this.signaling?.send({
        type: 'transfer:cancel',
        transferId,
      });
    }
  }

  dismissTransferRow(transferId: string): void {
    const row = this.transfers.find((r) => r.transferId === transferId);
    if (row) {
      for (const f of row.files) {
        if (f.downloadUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(f.downloadUrl);
        }
      }
    }
    this.transfers = this.transfers.filter((r) => r.transferId !== transferId);
  }

  async triggerSingleFileDownload(fileRow: TransferFileRow): Promise<void> {
    if (fileRow.cloudLinkId) {
      try {
        const ok = await downloadCloudLink(fileRow.cloudLinkId);
        if (ok) {
          fileRow.downloaded = true;
          return;
        }
      } catch {
        // fallback ke downloadUrl
      }
    }
    if (!fileRow.downloadUrl) return;
    triggerBrowserDownload(fileRow.downloadUrl, fileRow.name);
    fileRow.downloaded = true;
  }

  async copyCloudFileLink(fileRow: TransferFileRow): Promise<void> {
    if (!fileRow.cloudShareUrl) return;
    const ok = await copyTextToClipboard(fileRow.cloudShareUrl);
    if (ok) {
      fileRow.copied = true;
      setTimeout(() => {
        fileRow.copied = false;
      }, 2_000);
    }
  }

  // Pairing Actions (S5)
  openPairingDialog(defaultTab: 'create' | 'enter' = 'create'): void {
    this.pairingOpen = true;
    this.pairingTab = defaultTab;
    this.pairingError = null;
    if (defaultTab === 'create' && !this.createdPairingCode) {
      this.requestNewPairingCode();
    }
  }

  closePairingDialog(): void {
    this.pairingOpen = false;
    this.pairingError = null;
  }

  requestNewPairingCode(): void {
    this.pairingLoading = true;
    this.pairingError = null;
    this.signaling?.send({ type: 'pair:create' });
  }

  submitPairingCode(code: string): void {
    this.pairingLoading = true;
    this.pairingError = null;
    this.signaling?.send({ type: 'pair:join', code });
  }

  async fetchLinkQuota(): Promise<void> {
    try {
      const res = await fetch('/api/links/quota');
      if (res.ok) {
        const data = (await res.json()) as {
          enabled: boolean;
          remaining: number;
        };
        this.linkQuotaRemaining = data.remaining;
      }
    } catch {
      // abaikan
    }
  }
}

export const appState = new AppState();
