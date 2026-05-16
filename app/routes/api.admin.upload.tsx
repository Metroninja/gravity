import { randomUUID } from "node:crypto";

import { data } from "react-router";

import { requireAdmin } from "~/lib/auth.server";
import { getReadUrl, uploadObject } from "~/lib/storage.server";
import type { Route } from "./+types/api.admin.upload";

/**
 * Server-proxied upload for admin-uploaded assets (course covers, PDFs,
 * subtitles). The browser POSTs a multipart form with `kind` and `file`
 * fields; we validate, stream to GCS, and return the storage key plus a
 * short-lived preview URL so the form can render a thumbnail immediately.
 *
 * Video uploads will move to direct-to-GCS resumable uploads in a follow-up
 * because Cloud Run caps inbound request bodies at 32MB.
 */

// NOTE: video uploads currently proxy through the Node container. That works
// in local dev (no body cap) but in production on Cloud Run the per-request
// body cap is 32MB, which won't fit real videos. The follow-up there is a
// resumable direct-to-GCS upload from the browser — keeping that as a
// separate worktree.
const ALLOWED_KINDS = {
  "course-cover": { prefix: "covers", maxMb: 10, types: /^image\// },
  video: { prefix: "videos", maxMb: 4096, types: /^video\// },
  attachment: { prefix: "attachments", maxMb: 100, types: /^application\// },
  subtitles: { prefix: "subtitles", maxMb: 2, types: /^text\/(vtt|plain)/ },
} as const;

type Kind = keyof typeof ALLOWED_KINDS;

function safeExtension(filename: string) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename);
  return m ? m[1].toLowerCase() : "bin";
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const kind = form.get("kind");
  const file = form.get("file");

  if (typeof kind !== "string" || !(kind in ALLOWED_KINDS)) {
    return data({ error: "Invalid kind" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return data({ error: "Missing file" }, { status: 400 });
  }

  const cfg = ALLOWED_KINDS[kind as Kind];
  const contentType = file.type || "application/octet-stream";
  if (!cfg.types.test(contentType)) {
    return data(
      { error: `Content type ${contentType} not allowed for ${kind}` },
      { status: 400 },
    );
  }
  if (file.size > cfg.maxMb * 1024 * 1024) {
    return data(
      { error: `File too large; max ${cfg.maxMb}MB for ${kind}` },
      { status: 413 },
    );
  }

  const key = `${cfg.prefix}/${randomUUID()}.${safeExtension(file.name)}`;
  const buf = await file.arrayBuffer();
  await uploadObject(key, buf, contentType);

  const previewUrl = await getReadUrl(key, 60 * 10);
  return data({ key, previewUrl, contentType, sizeBytes: file.size });
}

export async function loader() {
  return data({ error: "Method not allowed" }, { status: 405 });
}
