const DB_NAME = 'andrew-editor-media-v1';
const STORE_NAME = 'media';
const DB_VERSION = 1;

type StoredMedia = { id: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento multimedia'));
  });
}

export async function putMediaFile(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, blob } satisfies StoredMedia);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el medio'));
  });
  db.close();
}

export async function getMediaFile(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  const value = await new Promise<StoredMedia | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredMedia | undefined);
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer el medio'));
  });
  db.close();
  return value?.blob;
}

export async function deleteMediaFile(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo eliminar el medio'));
  });
  db.close();
}
