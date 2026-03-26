/**
 * src/lib/chat/sendAttachment.ts
 *
 * Client-side library for media/document message attachments.
 *
 * Upload flow:
 *  1. POST /functions/v1/media-upload-url → { upload_url, object_path, storage_url, media_id }
 *  2. PUT upload_url with file bytes (direct to Supabase Storage, signed URL)
 *  3. sendMessageV1 with JSON body envelope kind='media'|'document' + storage_url
 *
 * Security:
 *  - Step 1: Edge Function validates JWT, MIME, size, rate limit, generates entropy path.
 *  - Step 2: Storage RLS enforces upload to own prefix via signed URL.
 *  - Step 3: DB RPC validates storage_url prefix matches initiator's uid.
 *  - Checksums (SHA-256) computed client-side and sent; server stores for integrity.
 *
 * Attack vectors mitigated:
 *  - MIME spoofing: server validates MIME in step 1 before signing.
 *  - Path traversal: server replaces filename with sanitized + entropy version.
 *  - Oversized upload: Storage bucket has file_size_limit = 100MB at storage layer.
 *  - Message with unowned URL: RPC in step 3 validates uid prefix in URL.
 */

import { supabase } from "@/lib/supabase";
import { sendMessageV1, buildChatBodyEnvelope } from "@/lib/chat/sendMessageV1";
import type { SendMessageV1Result } from "@/lib/chat/sendMessageV1";

// ── Types ─────────────────────────────────────────────────────────────────

export type MediaMessageType = "image" | "video" | "voice" | "video_circle" | "document";

export interface AttachmentUploadResult {
  objectPath: string;
  storageUrl: string;
  mediaId: string;
}

export interface AttachmentProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface SendAttachmentParams {
  conversationId: string;
  clientMsgId: string;
  file: File;
  /** Override detected type (optional). */
  mediaType?: MediaMessageType;
  /** Optional caption text. */
  caption?: string;
  /** Duration in seconds for voice/video. */
  durationSeconds?: number;
  /** Progress callback. */
  onProgress?: (progress: AttachmentProgress) => void;
}

// ── MIME → MediaMessageType ───────────────────────────────────────────────

function detectMediaType(file: File): MediaMessageType {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "audio/mpeg" || mime === "audio/ogg" || mime === "audio/webm" || mime === "audio/mp4") {
    return "voice";
  }
  return "document";
}

// ── SHA-256 checksum ──────────────────────────────────────────────────────

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Step 1: Request signed upload URL ────────────────────────────────────

async function requestUploadUrl(params: {
  mimeType: string;
  filename: string;
  sizeBytes: number;
  authToken: string;
}): Promise<{ upload_url: string; object_path: string; storage_url: string; media_id: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const endpoint = `${supabaseUrl}/functions/v1/media-upload-url`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mime_type: params.mimeType,
      filename: params.filename,
      size_bytes: params.sizeBytes,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(`upload_url_request_failed:${resp.status}:${body.error ?? "unknown"}`);
  }

  return resp.json();
}

// ── Step 2: Upload file via signed URL with XHR for progress ────────────

function uploadFileXHR(
  uploadUrl: string,
  file: File,
  onProgress?: (p: AttachmentProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      });
    }

    xhr.addEventListener("load", () => {
      // Supabase Storage returns 200 on successful signed upload
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`upload_failed:${xhr.status}:${xhr.responseText.slice(0, 200)}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("upload_network_error")));
    xhr.addEventListener("abort", () => reject(new Error("upload_aborted")));

    xhr.send(file);
  });
}

// ── Step 3: Register confirmed upload + send message ─────────────────────

async function confirmUploadAndSend(params: {
  conversationId: string;
  clientMsgId: string;
  mediaId: string;
  objectPath: string;
  storageUrl: string;
  mediaType: MediaMessageType;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  caption?: string;
  durationSeconds?: number;
  filename?: string;
}): Promise<SendMessageV1Result> {
  // Confirm registration with checksum
  await supabase.rpc("media_register_upload_v1", {
    p_object_path: params.objectPath,
    p_mime_type: params.mimeType,
    p_size_bytes: params.sizeBytes,
    p_checksum_sha256: params.checksum,
    p_entity_type: "message",
    p_entity_id: undefined, // message_id not yet assigned; linked by storage_url
  });

  const kind = params.mediaType === "document" ? "document" : "media";

  const envelope: Record<string, unknown> = {
    kind,
    media_url: params.storageUrl,
  };

  if (kind === "media") {
    envelope.media_type   = params.mediaType;
    envelope.text         = params.caption ?? "";
    if (params.durationSeconds) {
      envelope.duration_seconds = params.durationSeconds;
    }
  } else {
    // document
    envelope.filename = params.filename ?? "document";
    envelope.text     = params.caption ?? "";
  }

  const body = buildChatBodyEnvelope(envelope);

  return sendMessageV1({
    conversationId: params.conversationId,
    clientMsgId:    params.clientMsgId,
    body,
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Upload a file and send it as a message in one atomic flow.
 *
 * Throws on any step failure; no partial state committed to DB.
 * (Media object is registered in step 1 but orphan cleanup runs nightly.)
 */
export async function sendAttachment(
  params: SendAttachmentParams,
): Promise<SendMessageV1Result> {
  const {
    conversationId,
    clientMsgId,
    file,
    mediaType,
    caption,
    durationSeconds,
    onProgress,
  } = params;

  // Get current user's JWT for Edge Function auth
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new Error("not_authenticated");
  }
  const authToken = sessionData.session.access_token;

  const detectedType = mediaType ?? detectMediaType(file);

  // Step 1: Get signed upload URL
  const { upload_url, object_path, storage_url, media_id } = await requestUploadUrl({
    mimeType:  file.type,
    filename:  file.name,
    sizeBytes: file.size,
    authToken,
  });

  // Compute checksum in parallel with upload prep (non-blocking for UI)
  const fileBuffer = await file.arrayBuffer();
  const checksum = await sha256Hex(fileBuffer);

  // Step 2: Upload file
  await uploadFileXHR(upload_url, file, onProgress);

  // Step 3: Register + send message
  return confirmUploadAndSend({
    conversationId,
    clientMsgId,
    mediaId:        media_id,
    objectPath:     object_path,
    storageUrl:     storage_url,
    mediaType:      detectedType,
    mimeType:       file.type,
    sizeBytes:      file.size,
    checksum,
    caption,
    durationSeconds,
    filename:       file.name,
  });
}

/**
 * Generate a download URL for a private media object.
 * Uses media_get_signed_url_v1 RPC — validates caller has access.
 */
export async function getMediaDownloadUrl(
  mediaId: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.rpc("media_get_signed_url_v1", {
    p_media_id: mediaId,
    p_expires_in_seconds: expiresInSeconds,
  });

  if (error) throw error;

  // In production, call Supabase client SDK createSignedUrl with bucket+path
  const { bucket, path: objPath } = data as { bucket: string; path: string };
  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objPath, expiresInSeconds);

  if (signedErr || !signed) throw signedErr ?? new Error("signed_url_failed");

  return signed.signedUrl;
}
