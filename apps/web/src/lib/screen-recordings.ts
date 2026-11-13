import { sceneUsesScreenRecording, type CourseDocument, type ScreenRecording } from '@lms/course-schema';

/**
 * Gravações de tela do curso (MP4 próprio em tela cheia): lista, estado, casamento de arquivos por NOME e
 * aplicação do `assetId` no documento. Tudo puro: roda no navegador (pré-visualização do lote) e no servidor
 * (a rota refaz o casamento e é quem decide).
 */

export const SCREEN_RECORDING_DEFAULT_MAX_MB = 1024;

/** Limite de tamanho por arquivo, em bytes, a partir de `SCREEN_RECORDING_MAX_MB` (número ≥ 1; inválido = padrão 1024). */
export function screenRecordingMaxBytes(raw: string | undefined | null): number {
  const mb = Number(String(raw ?? '').trim());
  const valid = Number.isFinite(mb) && mb >= 1 ? Math.floor(mb) : SCREEN_RECORDING_DEFAULT_MAX_MB;
  return valid * 1024 * 1024;
}

/**
 * Chave de comparação do nome do arquivo: sem pasta, sem espaços nas pontas, sem a extensão `.mp4` e sem diferenciar
 * maiúsculas de minúsculas ("Tela 01.MP4", "tela 01" e "tela 01.mp4" são o mesmo arquivo).
 */
export function normalizeRecordingName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').normalize('NFC').trim().toLowerCase();
  return base.replace(/\.mp4$/i, '').trim();
}

export interface ScreenRecordingRow {
  moduleId: string;
  lessonId: string;
  lessonTitle: string;
  nodeId: string;
  nodeTitle: string;
  /** posição da gravação dentro da cena (0 = primeira) */
  index: number;
  fileName: string;
  assetId?: string | undefined;
  fit?: ScreenRecording['fit'] | undefined;
  durationSec?: number | undefined;
}

/** Todas as gravações de tela do rascunho, na ordem aula → cena → posição na cena. */
export function listScreenRecordings(doc: CourseDocument): ScreenRecordingRow[] {
  const rows: ScreenRecordingRow[] = [];
  for (const m of doc.modules) {
    for (const lesson of m.lessons) {
      for (const node of lesson.graph.nodes) {
        if (node.type !== 'scenario' && node.type !== 'content') continue;
        if (!sceneUsesScreenRecording(node)) continue;
        (node.screenRecordings ?? []).forEach((rec, index) => {
          rows.push({
            moduleId: m.id,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            nodeId: node.id,
            nodeTitle: node.title?.trim() || 'Cena sem título',
            index,
            fileName: rec.fileName,
            assetId: rec.assetId,
            fit: rec.fit,
            durationSec: rec.durationSec,
          });
        });
      }
    }
  }
  return rows;
}

export type RecordingState = 'missing' | 'uploaded' | 'short' | 'trimmed';

/** Estado mostrado ao lado do arquivo. `fit` só vale com mídia anexada (a montagem preenche depois). */
export function recordingState(rec: { assetId?: string | undefined; fit?: ScreenRecording['fit'] | undefined }): RecordingState {
  if (!rec.assetId) return 'missing';
  if (rec.fit === 'short') return 'short';
  if (rec.fit === 'trimmed') return 'trimmed';
  return 'uploaded';
}

export const RECORDING_STATE_LABEL: Record<RecordingState, string> = {
  missing: 'Falta mídia',
  uploaded: 'Enviado',
  short: 'Mídia curta — regravar',
  trimmed: 'Mídia cortada — conferir',
};

/** "Pendente" = falta mídia ou a montagem pediu atenção (curta/cortada). */
export function isPendingRecording(rec: { assetId?: string | undefined; fit?: ScreenRecording['fit'] | undefined }): boolean {
  return recordingState(rec) !== 'uploaded';
}

export interface ScreenRecordingSummary {
  total: number;
  uploaded: number;
  missing: number;
  /** enviados que a montagem marcou como curtos ou cortados */
  attention: number;
  /** cenas com gravação / cenas com todas as gravações enviadas ("prontas para montar") */
  scenes: number;
  scenesReady: number;
}

export function summarizeScreenRecordings(rows: readonly ScreenRecordingRow[]): ScreenRecordingSummary {
  const sceneKeys = new Map<string, boolean>();
  let uploaded = 0;
  let attention = 0;
  for (const r of rows) {
    const key = `${r.lessonId}/${r.nodeId}`;
    const ok = !!r.assetId;
    if (ok) uploaded++;
    if (ok && (r.fit === 'short' || r.fit === 'trimmed')) attention++;
    sceneKeys.set(key, (sceneKeys.get(key) ?? true) && ok);
  }
  return {
    total: rows.length,
    uploaded,
    missing: rows.length - uploaded,
    attention,
    scenes: sceneKeys.size,
    scenesReady: Array.from(sceneKeys.values()).filter(Boolean).length,
  };
}

export interface FileMatch<F> {
  file: F;
  /** gravações do curso ligadas a este arquivo (o mesmo nome em duas cenas liga nas duas) */
  targets: ScreenRecordingRow[];
}

export interface BatchMatch<F> {
  matched: FileMatch<F>[];
  /** arquivos sem gravação correspondente: não são enviados nem salvos */
  unrecognized: F[];
  /** arquivos repetidos no mesmo lote (mesmo nome): só o primeiro é enviado */
  duplicates: F[];
}

/** Casa os arquivos escolhidos com as gravações do curso pelo nome (ver `normalizeRecordingName`). */
export function matchFilesToRecordings<F extends { name: string }>(files: readonly F[], rows: readonly ScreenRecordingRow[]): BatchMatch<F> {
  const byName = new Map<string, ScreenRecordingRow[]>();
  for (const r of rows) {
    const k = normalizeRecordingName(r.fileName);
    const list = byName.get(k);
    if (list) list.push(r);
    else byName.set(k, [r]);
  }
  const seen = new Set<string>();
  const out: BatchMatch<F> = { matched: [], unrecognized: [], duplicates: [] };
  for (const file of files) {
    const k = normalizeRecordingName(file.name);
    const targets = k ? byName.get(k) : undefined;
    if (!targets) {
      out.unrecognized.push(file);
      continue;
    }
    if (seen.has(k)) {
      out.duplicates.push(file);
      continue;
    }
    seen.add(k);
    out.matched.push({ file, targets });
  }
  return out;
}

/**
 * Liga o `assetId` a TODA gravação do curso cujo nome casa com `fileName`, zerando `fit` e `durationSec`
 * (é um arquivo novo; a montagem mede de novo). Não mexe em mais nada. `linked` = quantas gravações mudaram;
 * 0 devolve o mesmo documento.
 */
export function applyRecordingAsset(doc: CourseDocument, fileName: string, assetId: string): { document: CourseDocument; linked: number } {
  const key = normalizeRecordingName(fileName);
  let linked = 0;
  const modules = doc.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((lesson) => {
      let touched = false;
      const nodes = lesson.graph.nodes.map((node) => {
        if ((node.type !== 'scenario' && node.type !== 'content') || !node.screenRecordings?.length) return node;
        let nodeTouched = false;
        const recs = node.screenRecordings.map((rec) => {
          if (normalizeRecordingName(rec.fileName) !== key) return rec;
          nodeTouched = true;
          linked++;
          const { fit: _fit, durationSec: _duration, ...rest } = rec;
          return { ...rest, assetId };
        });
        if (!nodeTouched) return node;
        touched = true;
        return { ...node, screenRecordings: recs };
      });
      return touched ? { ...lesson, graph: { ...lesson.graph, nodes } } : lesson;
    }),
  }));
  return linked ? { document: { ...doc, modules }, linked } : { document: doc, linked: 0 };
}

/** Assinatura de um MP4 (ISO base media): "ftyp" nos bytes 4–7. */
export function hasMp4Signature(head: Uint8Array): boolean {
  return head.byteLength >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

export type RecordingFileCheck = { ok: true } | { ok: false; reason: 'empty' | 'too_large' | 'type'; message: string };

/** Confere tipo declarado e tamanho (sem ler o conteúdo). Tipo vazio é aceito: o servidor confere a assinatura. */
export function checkRecordingMeta(input: { type: string; size: number }, maxBytes: number): RecordingFileCheck {
  if (input.size <= 0) return { ok: false, reason: 'empty', message: 'O arquivo está vazio.' };
  const type = input.type.trim().toLowerCase();
  if (type && type !== 'video/mp4') return { ok: false, reason: 'type', message: 'Envie um vídeo MP4.' };
  if (input.size > maxBytes) return { ok: false, reason: 'too_large', message: `O arquivo passa de ${formatLimit(maxBytes)}.` };
  return { ok: true };
}

export function formatLimit(bytes: number): string {
  const mb = Math.round(bytes / 1024 / 1024);
  return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`;
}

export type BatchItemStatus = 'waiting' | 'sending' | 'done' | 'error' | 'unrecognized' | 'duplicate' | 'invalid';

export interface BatchItem<F> {
  id: string;
  file: F;
  status: BatchItemStatus;
  /** 0 a 1 */
  progress: number;
  message?: string | undefined;
  /** gravações do curso que o arquivo atende (só para os reconhecidos) */
  targets: ScreenRecordingRow[];
}

/**
 * Monta a fila de um lote: reconhecidos e válidos ficam `waiting`; sem par no curso, `unrecognized` (nunca enviados);
 * nome repetido no lote, `duplicate`; tipo ou tamanho fora da regra, `invalid` com o motivo.
 */
export function prepareBatch<F extends { name: string; type: string; size: number }>(files: readonly F[], rows: readonly ScreenRecordingRow[], maxBytes: number): BatchItem<F>[] {
  const m = matchFilesToRecordings(files, rows);
  const items = new Map<F, BatchItem<F>>();
  files.forEach((file, i) => {
    items.set(file, { id: `${i}:${file.name}`, file, status: 'unrecognized', progress: 0, message: 'Não reconhecido: nenhuma gravação do curso tem esse nome.', targets: [] });
  });
  for (const d of m.duplicates) Object.assign(items.get(d)!, { status: 'duplicate', message: 'Nome repetido neste envio; só o primeiro foi usado.' });
  for (const { file, targets } of m.matched) {
    const meta = checkRecordingMeta(file, maxBytes);
    Object.assign(items.get(file)!, meta.ok ? { status: 'waiting', message: undefined, targets } : { status: 'invalid', message: meta.message, targets });
  }
  return files.map((f) => items.get(f)!);
}
