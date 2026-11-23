import {
  HEARTBEAT_INTERVAL_MS,
  type ClientMessage,
  type ServerMessage,
} from '@bagas-share/shared';

const DEVICE_ID_STORAGE_KEY = 'bagas_share_device_id';
const PAIR_TOKEN_SESSION_KEY = 'bagas_share_pair_token';

export function getOrCreateDeviceId(): string {
  // Gunakan sessionStorage agar setiap tab yang dibuka di browser yang sama
  // memiliki deviceId sendiri (tidak saling menendang koneksi WebSocket setiap 5 detik)
  if (typeof sessionStorage !== 'undefined') {
    const existingTabId = sessionStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existingTabId && /^[a-zA-Z0-9_-]{6,64}$/.test(existingTabId)) {
      return existingTabId;
    }
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'dev_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

export function getSessionPairToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(PAIR_TOKEN_SESSION_KEY);
}

export function setSessionPairToken(token: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (token) {
    sessionStorage.setItem(PAIR_TOKEN_SESSION_KEY, token);
  } else {
    sessionStorage.removeItem(PAIR_TOKEN_SESSION_KEY);
  }
}

export interface SignalingCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onMessage: (msg: ServerMessage) => void;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedManually = false;

  constructor(private callbacks: SignalingCallbacks) {}

  connect(): void {
    this.closedManually = false;
    this.clearTimers();

    const deviceId = getOrCreateDeviceId();
    const pairToken = getSessionPairToken();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ deviceId });
    if (pairToken) params.set('pairToken', pairToken);

    const url = `${proto}//${location.host}/ws?${params.toString()}`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.callbacks.onOpen();
      this.heartbeatTimer = setInterval(() => {
        this.send({ type: 'heartbeat' });
      }, HEARTBEAT_INTERVAL_MS);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        this.callbacks.onMessage(msg);
      } catch {
        // abaikan
      }
    };

    this.ws.onclose = () => {
      this.clearTimers();
      this.callbacks.onClose();
      if (!this.closedManually) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose akan terpanggil setelah onerror
    };
  }

  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  reconnectNow(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // abaikan
      }
    }
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5_000);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
