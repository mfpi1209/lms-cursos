/** Detecção de tipo por assinatura (magic bytes) — não confia no Content-Type do cliente. */
export const ALLOWED_MEDIA: Record<string, { kind: 'image' | 'audio' | 'video'; ext: string }> = {
  'image/png': { kind: 'image', ext: 'png' },
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
  'audio/wav': { kind: 'audio', ext: 'wav' },
  'audio/ogg': { kind: 'audio', ext: 'ogg' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
};

export const MAX_UPLOAD_BYTES: Record<'image' | 'audio' | 'video', number> = { image: 10 * 1024 * 1024, audio: 50 * 1024 * 1024, video: 300 * 1024 * 1024 };

export function sniffMime(head: Uint8Array): string | null {
  const h = (i: number) => head[i] ?? -1;
  const ascii = (start: number, len: number) => String.fromCharCode(...head.slice(start, start + len));
  if (h(0) === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (h(0) === 0xff && h(1) === 0xd8 && h(2) === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 3) === 'ID3' || (h(0) === 0xff && (h(1) & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(4, 4) === 'ftyp') return 'video/mp4';
  if (h(0) === 0x1a && h(1) === 0x45 && h(2) === 0xdf && h(3) === 0xa3) return 'video/webm';
  return null;
}
