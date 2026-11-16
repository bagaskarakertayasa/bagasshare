import type { DeviceKind } from '@bagas-share/shared';

export interface ParsedDeviceIdentity {
  baseName: string;
  kind: DeviceKind;
}

/**
 * Menghasilkan nama device otomatis "{Browser} di {OS}" dan jenis siluet device
 * dari User-Agent (PRD FR2.1, DESIGN-BRIEF Komponen DeviceSilhouette).
 */
export function parseUserAgent(uaRaw: string | undefined): ParsedDeviceIdentity {
  const ua = uaRaw || '';

  let os = 'Perangkat';
  let kind: DeviceKind = 'unknown';

  if (/iPhone/i.test(ua)) {
    os = 'iPhone';
    kind = 'phone';
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) {
    os = 'iPad';
    kind = 'tablet';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    kind = /Mobile/i.test(ua) ? 'phone' : 'tablet';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    kind = 'laptop';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'Mac';
    kind = 'laptop';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
    kind = 'laptop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    kind = 'desktop';
  }

  let browser = 'Browser';
  if (/EdgA?\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/CriOS\/|Chrome\//i.test(ua) && !/Edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) {
    browser = 'Safari';
  }

  return {
    baseName: `${browser} di ${os}`,
    kind,
  };
}

/**
 * Memberikan nomor urut jika ada nama kembar dalam satu grup (PRD FR2.2):
 * "Chrome di Windows", "Chrome di Windows (2)", dst.
 */
export function assignUniqueDisplayName(
  baseName: string,
  existingNames: Iterable<string>
): string {
  const used = new Set(existingNames);
  if (!used.has(baseName)) {
    return baseName;
  }
  let n = 2;
  while (used.has(`${baseName} (${n})`)) {
    n++;
  }
  return `${baseName} (${n})`;
}
