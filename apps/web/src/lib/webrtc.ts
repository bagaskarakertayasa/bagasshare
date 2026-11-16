import {
  CHUNK_SIZE_BYTES,
  DATA_CHANNEL_NAME,
  HIGH_WATER_MARK_BYTES,
  LOW_WATER_MARK_BYTES,
  P2P_CONNECT_TIMEOUT_MS,
  decodeChunkFrame,
  encodeChunkFrame,
  type DcControlMessage,
  type RtcIceCandidatePayload,
  type RtcSessionDescriptionPayload,
  type TransferFileMeta,
} from '@bagas-share/shared';
import {
  computeFileSha256Hex,
  equalBytes,
  sha256ChunkBytes,
} from './hash.js';
import {
  assembleBlobFromChunks,
  deleteStoredFile,
  getAllStoredTransfers,
  saveChunkBatch,
  saveTransferMeta,
} from './idb-resume.js';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface SenderFileItem {
  meta: TransferFileMeta;
  file: File;
}

export interface WebRtcSessionCallbacks {
  sendSignal: (payload: {
    sdp?: RtcSessionDescriptionPayload;
    ice?: RtcIceCandidatePayload;
  }) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFailedP2P: () => void;
  onFailedChecksum: (fileId: string) => void;
  onFailedStorage: () => void;
  onFileProgress: (fileId: string, bytesTransferred: number, totalBytes: number) => void;
  onFileDoneReceiver: (fileId: string, blob: Blob) => void;
  onAllDone: (filesCount: number) => void;
}

export class WebRtcTransferSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private pendingIce: RtcIceCandidatePayload[] = [];
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private aborted = false;

  constructor(
    public readonly transferId: string,
    public readonly role: 'sender' | 'receiver',
    private readonly filesMeta: TransferFileMeta[],
    private readonly senderFiles: SenderFileItem[],
    private readonly senderDeviceId: string,
    private readonly senderDisplayName: string,
    private readonly callbacks: WebRtcSessionCallbacks
  ) {
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && !this.aborted) {
        this.callbacks.sendSignal({ ice: ev.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.aborted) return;
      const st = this.pc.connectionState;
      if (st === 'connected') {
        this.clearConnectTimer();
      } else if (st === 'disconnected') {
        this.callbacks.onDisconnected();
      } else if (st === 'failed') {
        this.clearConnectTimer();
        this.callbacks.onFailedP2P();
      }
    };

    this.startConnectTimer();
  }

  private startConnectTimer(): void {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (
        !this.aborted &&
        this.pc.connectionState !== 'connected' &&
        (!this.dc || this.dc.readyState !== 'open')
      ) {
        this.callbacks.onFailedP2P();
        this.close();
      }
    }, P2P_CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  async startAsSender(): Promise<void> {
    const dc = this.pc.createDataChannel(DATA_CHANNEL_NAME, { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = LOW_WATER_MARK_BYTES;
    this.dc = dc;

    let resumeMap: Record<string, { nextChunkIndex: number }> = {};
    let startedSending = false;

    dc.onopen = () => {
      this.clearConnectTimer();
      this.callbacks.onConnected();
    };

    dc.onmessage = async (ev) => {
      if (typeof ev.data !== 'string' || this.aborted) return;
      const msg = JSON.parse(ev.data) as DcControlMessage;
      if (msg.type === 'file:resume-info' && !startedSending) {
        startedSending = true;
        resumeMap = msg.files || {};
        await this.runSenderLoop(dc, resumeMap);
      } else if (msg.type === 'file:verified' && !msg.ok) {
        this.callbacks.onFailedChecksum(msg.fileId);
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    if (this.pc.localDescription) {
      this.callbacks.sendSignal({
        sdp: {
          type: this.pc.localDescription.type,
          sdp: this.pc.localDescription.sdp,
        },
      });
    }
  }

  startAsReceiver(): void {
    this.pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dc.binaryType = 'arraybuffer';
      this.dc = dc;
      this.setupReceiverChannel(dc);
    };
  }

  async handleSignal(payload: {
    sdp?: RtcSessionDescriptionPayload;
    ice?: RtcIceCandidatePayload;
  }): Promise<void> {
    if (this.aborted) return;
    if (payload.sdp) {
      await this.pc.setRemoteDescription(payload.sdp);
      while (this.pendingIce.length > 0) {
        const cand = this.pendingIce.shift()!;
        await this.pc.addIceCandidate(cand);
      }
      if (payload.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        if (this.pc.localDescription) {
          this.callbacks.sendSignal({
            sdp: {
              type: this.pc.localDescription.type,
              sdp: this.pc.localDescription.sdp,
            },
          });
        }
      }
    } else if (payload.ice) {
      // D8: antrekan kandidat ICE jika remoteDescription belum terpasang
      if (this.pc.remoteDescription) {
        await this.pc.addIceCandidate(payload.ice);
      } else {
        this.pendingIce.push(payload.ice);
      }
    }
  }

  private waitDrain(dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount < HIGH_WATER_MARK_BYTES) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      dc.onbufferedamountlow = () => {
        dc.onbufferedamountlow = null;
        resolve();
      };
    });
  }

  private async runSenderLoop(
    dc: RTCDataChannel,
    resumeMap: Record<string, { nextChunkIndex: number }>
  ): Promise<void> {
    for (let fileIndex = 0; fileIndex < this.senderFiles.length; fileIndex++) {
      if (this.aborted) return;
      const item = this.senderFiles[fileIndex]!;
      const totalChunks = Math.ceil(item.file.size / CHUNK_SIZE_BYTES);
      const startChunkIndex = Math.min(
        totalChunks,
        Math.max(0, resumeMap[item.meta.sha256]?.nextChunkIndex ?? 0)
      );

      const startMsg: DcControlMessage = {
        type: 'file:start',
        fileId: item.meta.fileId,
        sha256: item.meta.sha256,
        name: item.meta.name,
        size: item.meta.size,
        totalChunks,
        startChunkIndex,
      };
      dc.send(JSON.stringify(startMsg));

      if (startChunkIndex > 0) {
        this.callbacks.onFileProgress(
          item.meta.fileId,
          Math.min(item.file.size, startChunkIndex * CHUNK_SIZE_BYTES),
          item.file.size
        );
      }

      for (let chunkIndex = startChunkIndex; chunkIndex < totalChunks; chunkIndex++) {
        if (this.aborted || dc.readyState !== 'open') return;
        const byteStart = chunkIndex * CHUNK_SIZE_BYTES;
        const byteEnd = Math.min(item.file.size, byteStart + CHUNK_SIZE_BYTES);
        const sliceBuf = await item.file.slice(byteStart, byteEnd).arrayBuffer();
        const payload = new Uint8Array(sliceBuf);
        const chunkSha = await sha256ChunkBytes(payload);
        const frame = encodeChunkFrame(fileIndex, chunkIndex, chunkSha, payload);

        if (dc.bufferedAmount >= HIGH_WATER_MARK_BYTES) {
          await this.waitDrain(dc);
        }
        dc.send(frame);
        this.callbacks.onFileProgress(item.meta.fileId, byteEnd, item.file.size);
      }

      const endMsg: DcControlMessage = {
        type: 'file:end',
        fileId: item.meta.fileId,
        sha256: item.meta.sha256,
      };
      dc.send(JSON.stringify(endMsg));
    }

    const doneMsg: DcControlMessage = { type: 'transfer:done' };
    dc.send(JSON.stringify(doneMsg));
    this.callbacks.onAllDone(this.senderFiles.length);
  }

  private setupReceiverChannel(dc: RTCDataChannel): void {
    let activeMeta: TransferFileMeta | null = null;
    let activeTotalChunks = 0;
    let receivedBytes = 0;
    let pendingBatch: Array<{ chunkIndex: number; data: ArrayBuffer }> = [];
    let memoryFallbackParts: ArrayBuffer[] = [];
    let useMemoryFallback = false;
    let processingQueue = Promise.resolve();

    dc.onopen = async () => {
      this.clearConnectTimer();
      this.callbacks.onConnected();

      // Cek apakah ada chunk parsial yang tersimpan di IndexedDB untuk file-file ini
      const stored = await getAllStoredTransfers();
      const storedBySha = new Map(stored.map((s) => [s.fileSha256, s]));
      const resumeFiles: Record<string, { nextChunkIndex: number }> = {};

      for (const f of this.filesMeta) {
        const totalChunks = Math.ceil(f.size / CHUNK_SIZE_BYTES);
        const existing = storedBySha.get(f.sha256);
        if (existing && existing.lastChunkIndex >= 0) {
          resumeFiles[f.sha256] = {
            nextChunkIndex: existing.lastChunkIndex + 1,
          };
        } else {
          const ok = await saveTransferMeta({
            fileSha256: f.sha256,
            transferId: this.transferId,
            fileId: f.fileId,
            fileName: f.name,
            fileSize: f.size,
            mimeType: f.mimeType,
            totalChunks,
            lastChunkIndex: -1,
            senderDeviceId: this.senderDeviceId,
            senderDisplayName: this.senderDisplayName,
            updatedAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          });
          if (!ok) {
            useMemoryFallback = true;
          }
        }
      }

      const resumeMsg: DcControlMessage = {
        type: 'file:resume-info',
        files: resumeFiles,
      };
      dc.send(JSON.stringify(resumeMsg));
    };

    dc.onmessage = (ev) => {
      processingQueue = processingQueue.then(async () => {
        if (this.aborted) return;
        if (typeof ev.data === 'string') {
          const ctrl = JSON.parse(ev.data) as DcControlMessage;
          if (ctrl.type === 'file:start') {
            activeMeta =
              this.filesMeta.find((f) => f.fileId === ctrl.fileId) ?? null;
            activeTotalChunks = ctrl.totalChunks;
            receivedBytes = Math.min(
              ctrl.size,
              ctrl.startChunkIndex * CHUNK_SIZE_BYTES
            );
            pendingBatch = [];
            if (ctrl.startChunkIndex === 0) {
              memoryFallbackParts = [];
            }
            if (activeMeta && receivedBytes > 0) {
              this.callbacks.onFileProgress(
                activeMeta.fileId,
                receivedBytes,
                activeMeta.size
              );
            }
          } else if (ctrl.type === 'file:end' && activeMeta) {
            const currentMeta = activeMeta;
            if (!useMemoryFallback && pendingBatch.length > 0) {
              const lastIdx = pendingBatch[pendingBatch.length - 1]!.chunkIndex;
              const saved = await saveChunkBatch(
                currentMeta.sha256,
                pendingBatch,
                lastIdx
              );
              pendingBatch = [];
              if (!saved) {
                this.callbacks.onFailedStorage();
                this.close();
                return;
              }
            }

            let blob: Blob | null = null;
            if (!useMemoryFallback) {
              blob = await assembleBlobFromChunks(
                currentMeta.sha256,
                activeTotalChunks,
                currentMeta.mimeType
              );
            }
            if (!blob) {
              blob = new Blob(memoryFallbackParts, {
                type: currentMeta.mimeType || 'application/octet-stream',
              });
            }

            const actualSha = await computeFileSha256Hex(blob);
            const verified =
              blob.size === currentMeta.size && actualSha === currentMeta.sha256;

            dc.send(
              JSON.stringify({
                type: 'file:verified',
                fileId: currentMeta.fileId,
                ok: verified,
              } satisfies DcControlMessage)
            );

            await deleteStoredFile(currentMeta.sha256);

            if (!verified) {
              this.callbacks.onFailedChecksum(currentMeta.fileId);
              this.close();
              return;
            }
            this.callbacks.onFileDoneReceiver(currentMeta.fileId, blob);
          } else if (ctrl.type === 'transfer:done') {
            this.callbacks.onAllDone(this.filesMeta.length);
          }
        } else if (ev.data instanceof ArrayBuffer && activeMeta) {
          const decoded = decodeChunkFrame(ev.data);
          const actualChunkSha = await sha256ChunkBytes(decoded.payload);
          if (!equalBytes(actualChunkSha, decoded.sha256Bytes)) {
            this.callbacks.onFailedChecksum(activeMeta.fileId);
            this.close();
            return;
          }

          const copyBuf = new ArrayBuffer(decoded.payload.byteLength);
          new Uint8Array(copyBuf).set(decoded.payload);

          if (useMemoryFallback) {
            memoryFallbackParts.push(copyBuf);
          } else {
            pendingBatch.push({
              chunkIndex: decoded.chunkIndex,
              data: copyBuf,
            });
            // Batch simpan setiap 32 chunk (512 KiB)
            if (pendingBatch.length >= 32) {
              const batchToSave = pendingBatch;
              pendingBatch = [];
              const lastIdx = batchToSave[batchToSave.length - 1]!.chunkIndex;
              const ok = await saveChunkBatch(
                activeMeta.sha256,
                batchToSave,
                lastIdx
              );
              if (!ok) {
                this.callbacks.onFailedStorage();
                this.close();
                return;
              }
            }
          }

          receivedBytes = Math.min(
            activeMeta.size,
            receivedBytes + decoded.payload.byteLength
          );
          this.callbacks.onFileProgress(
            activeMeta.fileId,
            receivedBytes,
            activeMeta.size
          );
        }
      });
    };
  }

  close(): void {
    this.aborted = true;
    this.clearConnectTimer();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {
        // abaikan
      }
      this.dc = null;
    }
    try {
      this.pc.close();
    } catch {
      // abaikan
    }
  }
}
