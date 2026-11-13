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
  // PDF: fora de ALLOWED_MEDIA (o upload de mídia do estúdio não aceita); só a entrega de tarefa usa (checkTaskFile)
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Arquivos que um ALUNO pode enviar numa entrega de tarefa: PDF, PNG e JPEG. Nada além disso, qualquer que seja o nome. */
export const TASK_FILE_TYPES: Record<string, { ext: string }> = {
  'application/pdf': { ext: 'pdf' },
  'image/png': { ext: 'png' },
  'image/jpeg': { ext: 'jpg' },
};

export type TaskFileCheck = { ok: true; mime: string; ext: string } | { ok: false; reason: 'empty' | 'too_large' | 'type'; message: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Confere o arquivo de uma entrega pelos BYTES (o nome e o Content-Type do navegador não contam):
 *  - tamanho: até `maxBytes`;
 *  - tipo: PDF (`%PDF-` no começo e `%%EOF` no fim), PNG (assinatura completa de 8 bytes) ou JPEG (`FF D8 FF` no começo;
 *    fotos de celular trazem dados depois do fim da imagem, então o fim não é conferido), e só os que a tarefa aceita (`accepted`).
 * Um executável, HTML ou script renomeado para .pdf é recusado. Não é antivírus: confere só o tipo.
 */
export function checkTaskFile(bytes: Uint8Array, opts: { maxBytes: number; accepted: readonly string[] }): TaskFileCheck {
  const mb = Math.round(opts.maxBytes / 1024 / 1024);
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty', message: 'O arquivo está vazio.' };
  if (bytes.byteLength > opts.maxBytes) return { ok: false, reason: 'too_large', message: `O arquivo passa de ${mb} MB.` };
  const names = opts.accepted.map((m) => (m === 'application/pdf' ? 'PDF' : m === 'image/png' ? 'PNG' : m === 'image/jpeg' ? 'JPEG' : null)).filter(Boolean);
  const wrong: TaskFileCheck = { ok: false, reason: 'type', message: `Tipo de arquivo não aceito. Envie ${names.join(', ').replace(/, ([^,]*)$/, ' ou $1') || 'um arquivo aceito pela tarefa'}.` };
  const mime = sniffMime(bytes.subarray(0, 32));
  const type = mime ? TASK_FILE_TYPES[mime] : undefined;
  if (!mime || !type || !opts.accepted.includes(mime)) return wrong;
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 2048));
  if (mime === 'application/pdf') {
    if (!Buffer.from(tail).includes('%%EOF')) return wrong;
  } else if (mime === 'image/png') {
    if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return wrong;
  }
  return { ok: true, mime, ext: type.ext };
}
