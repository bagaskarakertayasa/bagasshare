import { createHmac, createHash } from 'node:crypto';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

function cleanAccountId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]!
    .replace(/\.r2\.cloudflarestorage\.com$/, '');
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function getSigningKey(secretAccessKey: string, dateStamp: string): Buffer {
  const kDate = hmacSha256('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmacSha256(kDate, 'auto');
  const kService = hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

function toAmzDate(now: Date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function encodeS3Key(key: string): string {
  return key.split('/').map(encodeRfc3986).join('/');
}

/**
 * Membuat Presigned URL AWS Signature V4 untuk Cloudflare R2 (tanpa dependency eksternal).
 */
export function createR2PresignedUrl(params: {
  config: R2Config;
  method: 'GET' | 'PUT';
  objectKey: string;
  expiresInSec: number;
  queryParams?: Record<string, string>;
}): string {
  const { config, method, objectKey, expiresInSec, queryParams = {} } = params;
  const host = `${cleanAccountId(config.accountId)}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodeS3Key(objectKey)}`;
  const { amzDate, dateStamp } = toAmzDate();
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;

  const allQuery: Record<string, string> = {
    ...queryParams,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSec),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(allQuery)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(allQuery[k]!)}`)
    .join('&');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(config.secretAccessKey, dateStamp);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

/**
 * Menjalankan request S3 bertanda tangan langsung dari server ke Cloudflare R2
 * (untuk CreateMultipartUpload, CompleteMultipartUpload, AbortMultipartUpload, dan DeleteObject).
 */
export async function sendSignedR2Request(params: {
  config: R2Config;
  method: 'POST' | 'DELETE';
  objectKey: string;
  queryParams?: Record<string, string>;
  body?: string;
  contentType?: string;
}): Promise<{ statusCode: number; body: string }> {
  const {
    config,
    method,
    objectKey,
    queryParams = {},
    body = '',
    contentType,
  } = params;
  const host = `${cleanAccountId(config.accountId)}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodeS3Key(objectKey)}`;
  const { amzDate, dateStamp } = toAmzDate();
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const payloadHash = sha256Hex(body);

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k]!)}`)
    .join('&');

  const headersToSign: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) {
    headersToSign['content-type'] = contentType;
  }

  const sortedHeaderKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headersToSign[k]!.trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(config.secretAccessKey, dateStamp);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const reqHeaders: Record<string, string> = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: authHeader,
  };
  if (contentType) {
    reqHeaders['Content-Type'] = contentType;
  }

  const url = canonicalQueryString
    ? `https://${host}${canonicalUri}?${canonicalQueryString}`
    : `https://${host}${canonicalUri}`;

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? body : undefined,
  });

  return {
    statusCode: res.status,
    body: await res.text(),
  };
}

export async function r2CreateMultipartUpload(
  config: R2Config,
  objectKey: string,
  mimeType: string
): Promise<string> {
  const res = await sendSignedR2Request({
    config,
    method: 'POST',
    objectKey,
    queryParams: { uploads: '' },
    contentType: mimeType || 'application/octet-stream',
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`R2 CreateMultipartUpload gagal (${res.statusCode}): ${res.body}`);
  }
  const match = res.body.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match?.[1]) {
    throw new Error('UploadId tidak ditemukan pada respons R2');
  }
  return match[1];
}

export async function r2CompleteMultipartUpload(
  config: R2Config,
  objectKey: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const xmlParts = sorted
    .map((p) => {
      const cleanEtag = p.etag.startsWith('"') ? p.etag : `"${p.etag}"`;
      return `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${cleanEtag}</ETag></Part>`;
    })
    .join('');
  const xmlBody = `<CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`;

  const res = await sendSignedR2Request({
    config,
    method: 'POST',
    objectKey,
    queryParams: { uploadId },
    body: xmlBody,
    contentType: 'application/xml',
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`R2 CompleteMultipartUpload gagal (${res.statusCode}): ${res.body}`);
  }
}

export async function r2DeleteObject(
  config: R2Config,
  objectKey: string
): Promise<void> {
  await sendSignedR2Request({
    config,
    method: 'DELETE',
    objectKey,
  }).catch(() => {
    // Abaikan error saat hapus objek yang mungkin sudah terhapus
  });
}
