export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'unknown';
export type ColorSlot = 1 | 2 | 3 | 4;
export type GroupSource = 'auto_ip' | 'pairing_code';

export interface PeerInfo {
  deviceId: string;
  displayName: string;
  kind: DeviceKind;
  colorSlot: ColorSlot;
  source: GroupSource;
  busy: boolean;
}

export interface TransferFileMeta {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
}

export interface RtcSessionDescriptionPayload {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface RtcIceCandidatePayload {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type ClientMessage =
  | { type: 'heartbeat' }
  | { type: 'pair:create' }
  | { type: 'pair:join'; code: string }
  | {
      type: 'transfer:request';
      targetDeviceId: string;
      resumeTransferId?: string;
      files: TransferFileMeta[];
    }
  | {
      type: 'transfer:respond';
      transferId: string;
      accept: boolean;
      reason?: 'rejected' | 'busy';
    }
  | { type: 'transfer:cancel'; transferId: string }
  | {
      type: 'rtc:signal';
      transferId: string;
      targetDeviceId: string;
      sdp?: RtcSessionDescriptionPayload;
      ice?: RtcIceCandidatePayload;
    }
  | {
      type: 'transfer:complete';
      transferId: string;
      filesReceived: number;
    };

export type PairErrorReason =
  | 'invalid'
  | 'expired'
  | 'used'
  | 'rate_limited'
  | 'group_full';

export type TransferStatusKind =
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'busy'
  | 'cancelled'
  | 'completed'
  | 'quota_exceeded'
  | 'invalid_files';

export type ServerMessage =
  | {
      type: 'welcome';
      deviceId: string;
      displayName: string;
      kind: DeviceKind;
      groupId: string;
      quotaRemaining: number;
      quotaResetAt: string;
    }
  | { type: 'group:full' }
  | { type: 'peers:update'; peers: PeerInfo[] }
  | {
      type: 'pair:created';
      code: string;
      expiresAt: string;
      pairToken: string;
    }
  | {
      type: 'pair:joined';
      groupId: string;
      pairToken: string;
    }
  | {
      type: 'pair:error';
      reason: PairErrorReason;
      retryAfterSec?: number;
    }
  | {
      type: 'transfer:created';
      transferId: string;
      expiresAt: string;
    }
  | {
      type: 'transfer:incoming';
      transferId: string;
      from: PeerInfo;
      expiresAt: string;
      isResume: boolean;
      files: TransferFileMeta[];
    }
  | {
      type: 'transfer:status';
      transferId: string;
      status: TransferStatusKind;
      message?: string;
    }
  | {
      type: 'rtc:signal';
      transferId: string;
      fromDeviceId: string;
      sdp?: RtcSessionDescriptionPayload;
      ice?: RtcIceCandidatePayload;
    }
  | {
      type: 'quota:update';
      quotaRemaining: number;
      quotaResetAt: string;
    };

export type DcControlMessage =
  | {
      type: 'file:resume-info';
      files: Record<string, { nextChunkIndex: number }>;
    }
  | {
      type: 'file:start';
      fileId: string;
      sha256: string;
      name: string;
      size: number;
      totalChunks: number;
      startChunkIndex: number;
    }
  | {
      type: 'file:end';
      fileId: string;
      sha256: string;
    }
  | {
      type: 'file:verified';
      fileId: string;
      ok: boolean;
    }
  | {
      type: 'transfer:done';
    };
