import { describe, it, expect } from 'vitest';
import { extractClientIp, normalizeIpToGroup } from './ip-group.js';
import { parseUserAgent, assignUniqueDisplayName } from './ua-name.js';
import { StateDatabase, getWitaDateAndNextReset } from './db.js';
import { GroupManager } from './group-manager.js';
import { createR2PresignedUrl } from './r2.js';

describe('ip-group (D1 & D2)', () => {
  it('menormalisasi IPv4 dan IPv6 prefix /64 ke grup yang sama', () => {
    expect(normalizeIpToGroup('::ffff:182.1.2.3')).toBe('182.1.2.3');
    expect(normalizeIpToGroup('2001:db8:abcd:0012:1111:2222:3333:4444')).toBe(
      '2001:0db8:abcd:0012'
    );
    expect(normalizeIpToGroup('2001:db8:abcd:12::99')).toBe('2001:0db8:abcd:0012');
    expect(normalizeIpToGroup('::1')).toBe('127.0.0.1');
  });

  it('hanya mempercayai X-Real-IP jika koneksi berasal dari loopback (F5)', () => {
    const fromLoopback = {
      headers: { 'x-real-ip': '203.0.113.5' },
      socket: { remoteAddress: '127.0.0.1' },
    } as any;
    expect(extractClientIp(fromLoopback, true)).toBe('203.0.113.5');

    const fromExternal = {
      headers: { 'x-real-ip': '203.0.113.5' },
      socket: { remoteAddress: '198.51.100.9' },
    } as any;
    expect(extractClientIp(fromExternal, true)).toBe('198.51.100.9');
  });
});

describe('ua-name (FR2.1 & FR2.2)', () => {
  it('membentuk nama {Browser} di {OS} dan nomor urut kembar', () => {
    const p1 = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
    );
    expect(p1).toEqual({ baseName: 'Chrome di Android', kind: 'phone' });

    const p2 = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1'
    );
    expect(p2).toEqual({ baseName: 'Safari di iPhone', kind: 'phone' });

    expect(
      assignUniqueDisplayName('Chrome di Windows', [
        'Chrome di Windows',
        'Chrome di Windows (2)',
      ])
    ).toBe('Chrome di Windows (3)');
  });
});

describe('StateDatabase (kuota WITA & pairing)', () => {
  it('menghitung kuota 10 file/hari per IP dan reset pada 00:00 WITA', () => {
    const db = new StateDatabase(':memory:');
    // 2026-11-16 23:50 WITA = 15:50 UTC
    const beforeMidnight = Date.UTC(2026, 10, 16, 15, 50, 0);
    // 2026-11-17 00:05 WITA = 16:05 UTC
    const afterMidnight = Date.UTC(2026, 10, 16, 16, 5, 0);

    expect(getWitaDateAndNextReset(beforeMidnight).dateWita).toBe('2026-11-16');
    expect(getWitaDateAndNextReset(afterMidnight).dateWita).toBe('2026-11-17');

    db.incrementFilesReceived('103.1.2.3', 4, beforeMidnight);
    expect(db.getQuotaStatus('103.1.2.3', beforeMidnight).remaining).toBe(6);
    // Setelah lewat 00:00 WITA kembali ke 10
    expect(db.getQuotaStatus('103.1.2.3', afterMidnight).remaining).toBe(10);

    // Kuota Link 5 GB: maks 3 link/hari/IP
    expect(db.getLinkQuotaStatus('103.1.2.3', beforeMidnight).remaining).toBe(3);
    db.incrementLinksCreated('103.1.2.3', beforeMidnight);
    expect(db.getLinkQuotaStatus('103.1.2.3', beforeMidnight).remaining).toBe(2);
    expect(db.getLinkQuotaStatus('103.1.2.3', afterMidnight).remaining).toBe(3);

    // Shared link record + TTL 6 jam
    const rec = db.createSharedLinkRecord({
      linkId: 'abc12345',
      objectKey: 'links/abc12345/video.mp4',
      uploadId: 'up-1',
      fileName: 'video.mp4',
      fileSize: 1024 * 1024,
      mimeType: 'video/mp4',
      senderIp: '103.1.2.3',
      nowMs: beforeMidnight,
    });
    expect(rec.status).toBe('uploading');
    db.markSharedLinkReady('abc12345');
    expect(db.getSharedLink('abc12345')?.status).toBe('ready');

    const url = createR2PresignedUrl({
      config: {
        accountId: 'acc123',
        accessKeyId: 'key123',
        secretAccessKey: 'sec123',
        bucketName: 'bagas-share',
      },
      method: 'PUT',
      objectKey: rec.objectKey,
      expiresInSec: 3600,
      queryParams: { partNumber: '1', uploadId: 'up-1' },
    });
    expect(url).toContain('acc123.r2.cloudflarestorage.com/bagas-share/links/abc12345/video.mp4');
    expect(url).toContain('X-Amz-Signature=');

    db.close();
  });

  it('membuat kode pairing 6 digit sekali pakai dan memblokir brute force > 10 kali', () => {
    const db = new StateDatabase(':memory:');
    const now = Date.now();
    const created = db.createPairingCode('grp-1', 'dev-a', now);
    expect(created.code).toMatch(/^\d{6}$/);

    // Percobaan pertama berhasil
    const ok = db.redeemPairingCode(created.code, 'dev-b', '10.0.0.1', now + 1000);
    expect(ok.ok).toBe(true);
    expect(ok.groupId).toBe('grp-1');

    // Percobaan kedua dengan kode yang sama ditolak karena sekali pakai
    const used = db.redeemPairingCode(created.code, 'dev-c', '10.0.0.2', now + 2000);
    expect(used.ok).toBe(false);
    expect(used.reason).toBe('used');

    // 10 kali salah dari IP yang sama -> rate_limited
    for (let i = 0; i < 9; i++) {
      const r = db.redeemPairingCode('999999', 'dev-x', '10.0.0.9', now + i);
      expect(r.reason).toBe('invalid');
    }
    const tenth = db.redeemPairingCode('999999', 'dev-x', '10.0.0.9', now + 50);
    expect(tenth.ok).toBe(false);
    expect(tenth.reason).toBe('rate_limited');

    db.close();
  });
});

describe('GroupManager (batas 5 device, slot warna, & proteksi sessionToken F4)', () => {
  it('menerima maksimal 5 device dan menolak device ke-6 dengan group_full', () => {
    const gm = new GroupManager();
    const fakeWs = { readyState: 1, send: () => {}, close: () => {} } as any;

    for (let i = 1; i <= 5; i++) {
      const res = gm.registerOrReconnect({
        deviceId: `dev-${i}`,
        sessionToken: `secret-token-${i}-00000000`,
        groupId: 'g1',
        source: 'auto_ip',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
        clientIp: '1.1.1.1',
        ws: fakeWs,
      });
      expect(res.ok).toBe(true);
    }

    const sixth = gm.registerOrReconnect({
      deviceId: 'dev-6',
      sessionToken: 'secret-token-6-00000000',
      groupId: 'g1',
      source: 'auto_ip',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
      clientIp: '1.1.1.1',
      ws: fakeWs,
    });
    expect(sixth).toEqual({ ok: false, reason: 'group_full' });
  });

  it('mencegah pengambilalihan deviceId oleh klien lain dengan sessionToken berbeda (F4)', () => {
    const gm = new GroupManager();
    let victimClosed = false;
    const victimWs = { readyState: 1, send: () => {}, close: () => { victimClosed = true; } } as any;
    const attackerWs = { readyState: 1, send: () => {}, close: () => {} } as any;

    const victim = gm.registerOrReconnect({
      deviceId: 'victim-id-1234',
      sessionToken: 'victim-secret-token-123456',
      groupId: 'g1',
      source: 'auto_ip',
      userAgent: 'Chrome/130.0 Windows',
      clientIp: '1.1.1.1',
      ws: victimWs,
    });
    expect(victim.ok).toBe(true);

    const hijack = gm.registerOrReconnect({
      deviceId: 'victim-id-1234',
      sessionToken: 'attacker-different-token-999',
      groupId: 'g1',
      source: 'auto_ip',
      userAgent: 'Chrome/130.0 Android',
      clientIp: '1.1.1.1',
      ws: attackerWs,
    });
    expect(hijack.ok).toBe(true);
    if (hijack.ok) {
      expect(hijack.device.deviceId).not.toBe('victim-id-1234');
    }
    expect(victimClosed).toBe(false);
    expect(gm.getDevice('victim-id-1234')?.ws).toBe(victimWs);
  });
});
