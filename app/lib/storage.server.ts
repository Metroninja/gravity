import { Storage } from "@google-cloud/storage";

import { storageEnv } from "./env.server";

/**
 * Build a GCS client.
 *
 * - In production on Cloud Run we use Application Default Credentials.
 * - In local dev we point at `fake-gcs-server` via `GCS_EMULATOR_HOST` and
 *   skip auth. Signed URLs from the real GCS API don't work against the
 *   emulator, so {@link getReadUrl} / {@link getUploadUrl} return direct
 *   `http://gcs:4443/...` URLs in dev.
 */
let cachedStorage: Storage | null = null;

function getStorage() {
  if (cachedStorage) return cachedStorage;
  const e = storageEnv();
  if (e.GCS_EMULATOR_HOST) {
    cachedStorage = new Storage({
      apiEndpoint: e.GCS_EMULATOR_HOST,
      projectId: e.GCS_PROJECT_ID ?? "janneke-local",
      useAuthWithCustomEndpoint: false,
    });
  } else {
    cachedStorage = new Storage({ projectId: e.GCS_PROJECT_ID });
  }
  return cachedStorage;
}

function emulatorUrl(key: string) {
  const e = storageEnv();
  const host = e.GCS_EMULATOR_HOST!.replace(/\/$/, "");
  return `${host}/storage/v1/b/${encodeURIComponent(e.GCS_BUCKET)}/o/${encodeURIComponent(key)}?alt=media`;
}

/**
 * Returns a URL the browser can hit to GET an object (used for videos, PDFs,
 * subtitles, course covers). Expires after `ttlSeconds`.
 */
export async function getReadUrl(key: string, ttlSeconds = 60 * 60) {
  if (!key) throw new Error("getReadUrl: empty key");
  const e = storageEnv();
  if (e.GCS_EMULATOR_HOST) {
    // The emulator doesn't enforce signing; return a public-style URL.
    return emulatorUrl(key);
  }
  const [url] = await getStorage()
    .bucket(e.GCS_BUCKET)
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlSeconds * 1000,
    });
  return url;
}

/**
 * Returns a URL the client can PUT to in order to upload a single object
 * directly to GCS (bypassing the web container). Use this from the eventual
 * admin/upload UI; not consumed by the student-facing MVP today.
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  ttlSeconds = 60 * 15,
) {
  if (!key) throw new Error("getUploadUrl: empty key");
  const e = storageEnv();
  if (e.GCS_EMULATOR_HOST) {
    const host = e.GCS_EMULATOR_HOST.replace(/\/$/, "");
    return `${host}/upload/storage/v1/b/${encodeURIComponent(e.GCS_BUCKET)}/o?uploadType=media&name=${encodeURIComponent(key)}`;
  }
  const [url] = await getStorage()
    .bucket(e.GCS_BUCKET)
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "write",
      contentType,
      expires: Date.now() + ttlSeconds * 1000,
    });
  return url;
}

/**
 * Stream an uploaded file straight to the bucket. Used by the admin upload
 * proxy — cover images / PDFs / small assets that fit in a single HTTP
 * request. For multi-GB video we'll switch to direct-to-GCS resumable
 * uploads in a follow-up.
 */
export async function uploadObject(
  key: string,
  contents: ArrayBuffer | Uint8Array | Buffer,
  contentType: string,
) {
  if (!key) throw new Error("uploadObject: empty key");
  const buf = Buffer.isBuffer(contents)
    ? contents
    : Buffer.from(contents instanceof ArrayBuffer ? new Uint8Array(contents) : contents);
  await getStorage()
    .bucket(storageEnv().GCS_BUCKET)
    .file(key)
    .save(buf, { contentType, resumable: false });
}

export async function deleteObject(key: string) {
  if (!key) return;
  try {
    await getStorage()
      .bucket(storageEnv().GCS_BUCKET)
      .file(key)
      .delete({ ignoreNotFound: true });
  } catch {
    // Best effort — orphaned objects are tolerable.
  }
}

export async function objectExists(key: string) {
  try {
    const [exists] = await getStorage()
      .bucket(storageEnv().GCS_BUCKET)
      .file(key)
      .exists();
    return exists;
  } catch {
    return false;
  }
}
