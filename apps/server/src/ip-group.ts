import type { IncomingMessage } from 'node:http';

/**
 * Normalisasi IP menjadi kunci grup jaringan (TECH-DESIGN D1 & D2):
 * - IPv4-mapped IPv6 (`::ffff:1.2.3.4`) -> `1.2.3.4`
 * - IPv4 loopbacks (`127.0.0.1`) dan IPv6 loopback (`::1`) disamakan menjadi `local`
 * - IPv6 normal diambil prefix `/64` (4 hextet pertama)
 */
export function normalizeIpToGroup(rawIp: string): string {
  let ip = rawIp.trim().toLowerCase();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || !ip) {
    return '127.0.0.1';
  }
  if (!ip.includes(':')) {
    return ip;
  }
  const parts = ip.split('::');
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length > 1 && parts[1] ? parts[1].split(':') : [];
  const missing = Math.max(0, 8 - head.length - tail.length);
  const full = [
    ...head,
    ...Array.from({ length: missing }, () => '0'),
    ...tail,
  ].map((h) => h.padStart(4, '0'));
  return full.slice(0, 4).join(':');
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const cleaned = addr.trim().toLowerCase();
  return (
    cleaned === '127.0.0.1' ||
    cleaned === '::1' ||
    cleaned === '::ffff:127.0.0.1'
  );
}

/**
 * Mengambil IP client dengan memperhatikan keputusan keamanan D2 (`trustProxy`).
 * Header proxy hanya dipercaya jika koneksi TCP masuk berasal dari proxy loopback lokal.
 */
export function extractClientIp(req: IncomingMessage, trustProxy: boolean): string {
  const remoteAddr = req.socket?.remoteAddress;
  if (trustProxy && isLoopbackAddress(remoteAddr)) {
    const xRealIp = req.headers['x-real-ip'];
    if (typeof xRealIp === 'string' && xRealIp.trim()) {
      return xRealIp.trim();
    }
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  return remoteAddr || '127.0.0.1';
}
