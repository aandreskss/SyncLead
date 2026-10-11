// Phase 10B — Incoming media types

export type MediaProcessingStatus =
  | "pending"
  | "processing"
  | "done"
  | "unsupported"
  | "dead_letter"

// MIME types we attempt to understand via Claude Vision
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const

// Audio types are NOT supported for automatic transcription in this phase.
// Messages with audio are routed to human visibility.
export const AUDIO_MIME_TYPES = [
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/opus",
  "audio/aac",
  "audio/wav",
  "audio/ogg; codecs=opus",
] as const

export type ImageMimeType = typeof IMAGE_MIME_TYPES[number]
export type AudioMimeType = typeof AUDIO_MIME_TYPES[number]

export function isImageMime(mime: string): mime is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime)
}

export function isAudioMime(mime: string): boolean {
  return (AUDIO_MIME_TYPES as readonly string[]).some((m) => mime.startsWith(m.split(";")[0]))
}

// Maximum file size for media downloads (5 MB)
export const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024

// Maximum tokens Claude Vision may use to describe one image
export const MAX_VISION_TOKENS = 512

// How many seconds before a media processing attempt times out
export const MEDIA_PROCESSING_TIMEOUT_MS = 30_000
