import {
  CHUNK_SIZE_BYTES,
  type ColorSlot,
  type TransferFileMeta,
} from '@bagas-share/shared';
import {
  cleanupExpiredStoredFiles,
  getAllStoredTransfers,
} from './idb-resume.js';

export interface PendingSenderResume {
  transferId: string;
  targetDeviceId: string;
  targetDisplayName: string;
  targetColorSlot: ColorSlot;
  files: TransferFileMeta[];
}

export interface RecoveredReceiverTransfer {
  transferId: string;
  peerDeviceId: string;
  peerDisplayName: string;
  files: Array<{
    fileId: string;
    name: string;
    size: number;
    mimeType: string;
    sha256: string;
    bytesTransferred: number;
  }>;
}

const SENDER_RESUME_SESSION_KEY = 'bagas_share_pending_sender_resume';

export function readSenderResumeSession(): PendingSenderResume | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(SENDER_RESUME_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingSenderResume;
    if (parsed && parsed.files?.length > 0) {
      return parsed;
    }
  } catch {
    // abaikan
  }
  return null;
}

export function writeSenderResumeSession(data: PendingSenderResume | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (data) {
    sessionStorage.setItem(SENDER_RESUME_SESSION_KEY, JSON.stringify(data));
  } else {
    sessionStorage.removeItem(SENDER_RESUME_SESSION_KEY);
  }
}

export async function loadInterruptedTransfers(): Promise<{
  senderResume: PendingSenderResume | null;
  receiverTransfers: RecoveredReceiverTransfer[];
}> {
  await cleanupExpiredStoredFiles();
  const senderResume = readSenderResumeSession();
  const stored = await getAllStoredTransfers();

  const byTransfer = new Map<string, typeof stored>();
  for (const item of stored) {
    const list = byTransfer.get(item.transferId) ?? [];
    list.push(item);
    byTransfer.set(item.transferId, list);
  }

  const receiverTransfers: RecoveredReceiverTransfer[] = [];
  for (const [transferId, items] of byTransfer) {
    const first = items[0]!;
    receiverTransfers.push({
      transferId,
      peerDeviceId: first.senderDeviceId,
      peerDisplayName: first.senderDisplayName || 'Perangkat',
      files: items.map((m) => ({
        fileId: m.fileId,
        name: m.fileName,
        size: m.fileSize,
        mimeType: m.mimeType,
        sha256: m.fileSha256,
        bytesTransferred: Math.min(
          m.fileSize,
          Math.max(0, (m.lastChunkIndex + 1) * CHUNK_SIZE_BYTES)
        ),
      })),
    });
  }

  return { senderResume, receiverTransfers };
}
