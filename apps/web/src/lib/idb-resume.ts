import { RESUME_TTL_MS } from '@bagas-share/shared';

const DB_NAME = 'bagas-share-db';
const DB_VERSION = 1;

export interface StoredTransferMeta {
  fileSha256: string;
  transferId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  lastChunkIndex: number; // -1 jika belum ada chunk
  senderDeviceId: string;
  senderDisplayName: string;
  updatedAt: number;
  expiresAt: number;
}

export interface StoredChunkRecord {
  fileSha256: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('transfers')) {
          db.createObjectStore('transfers', { keyPath: 'fileSha256' });
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const store = db.createObjectStore('chunks', {
            keyPath: ['fileSha256', 'chunkIndex'],
          });
          store.createIndex('by_file', 'fileSha256', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function isIdbAvailable(): Promise<boolean> {
  const db = await openDb();
  return db !== null;
}

export async function saveTransferMeta(meta: StoredTransferMeta): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('transfers', 'readwrite');
      tx.objectStore('transfers').put(meta);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Menyimpan batch chunk (mis. setiap 32 chunk = 512 KiB) dan memperbarui lastChunkIndex
 * dalam satu transaksi agar Safari iOS tetap cepat (TECH-DESIGN 7.2.C).
 */
export async function saveChunkBatch(
  fileSha256: string,
  chunks: Array<{ chunkIndex: number; data: ArrayBuffer }>,
  lastChunkIndex: number
): Promise<boolean> {
  const db = await openDb();
  if (!db || chunks.length === 0) return true;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['transfers', 'chunks'], 'readwrite');
      const chunkStore = tx.objectStore('chunks');
      for (const c of chunks) {
        chunkStore.put({
          fileSha256,
          chunkIndex: c.chunkIndex,
          data: c.data,
        } satisfies StoredChunkRecord);
      }
      const trStore = tx.objectStore('transfers');
      const getReq = trStore.get(fileSha256);
      getReq.onsuccess = () => {
        const existing = getReq.result as StoredTransferMeta | undefined;
        if (existing) {
          existing.lastChunkIndex = Math.max(existing.lastChunkIndex, lastChunkIndex);
          existing.updatedAt = Date.now();
          existing.expiresAt = Date.now() + RESUME_TTL_MS;
          trStore.put(existing);
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getAllStoredTransfers(): Promise<StoredTransferMeta[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('transfers', 'readonly');
      const req = tx.objectStore('transfers').getAll();
      req.onsuccess = () => resolve((req.result as StoredTransferMeta[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function assembleBlobFromChunks(
  fileSha256: string,
  totalChunks: number,
  mimeType: string
): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('chunks', 'readonly');
      const idx = tx.objectStore('chunks').index('by_file');
      const req = idx.getAll(IDBKeyRange.only(fileSha256));
      req.onsuccess = () => {
        const rows = ((req.result as StoredChunkRecord[]) || []).sort(
          (a, b) => a.chunkIndex - b.chunkIndex
        );
        if (rows.length < totalChunks) {
          resolve(null);
          return;
        }
        const parts = rows.slice(0, totalChunks).map((r) => r.data);
        resolve(new Blob(parts, { type: mimeType || 'application/octet-stream' }));
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteStoredFile(fileSha256: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(['transfers', 'chunks'], 'readwrite');
      tx.objectStore('transfers').delete(fileSha256);
      const idx = tx.objectStore('chunks').index('by_file');
      const cursorReq = idx.openKeyCursor(IDBKeyRange.only(fileSha256));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          tx.objectStore('chunks').delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cleanupExpiredStoredFiles(nowMs: number = Date.now()): Promise<void> {
  const all = await getAllStoredTransfers();
  for (const item of all) {
    if (item.expiresAt < nowMs) {
      await deleteStoredFile(item.fileSha256);
    }
  }
}
