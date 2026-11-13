import { describe, expect, it } from 'vitest';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import {
  applyRecordingAsset,
  checkRecordingMeta,
  hasMp4Signature,
  isPendingRecording,
  listScreenRecordings,
  matchFilesToRecordings,
  normalizeRecordingName,
  prepareBatch,
  recordingState,
  screenRecordingMaxBytes,
  summarizeScreenRecordings,
} from './screen-recordings';

const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso',
  modules: [
    {
      id: 'm1',
      title: 'M',
      lessons: [
        {
          id: 'aula_1',
          title: 'Aula 1',
          graph: {
            schemaVersion: 1,
            startNodeId: 'v1',
            nodes: [
              { id: 'v1', type: 'content', title: 'Pedido', body: richTextFromPlain('x'), screenRecordings: [{ fileName: 'Tela-01.mp4' }, { fileName: 'tela-02.MP4', assetId: 'ast_2', fit: 'short', durationSec: 8 }] },
              { id: 'v2', type: 'scenario', body: richTextFromPlain('y'), screenRecordings: [{ fileName: 'tela-01.mp4', assetId: 'ast_old', fit: 'trimmed', durationSec: 40 }] },
              { id: 'v3', type: 'content', title: 'Sem tela', body: richTextFromPlain('z') },
              { id: 'fim', type: 'end', summary: richTextFromPlain('Fim') },
            ],
            edges: [
              { id: 'e1', from: 'v1', to: 'v2' },
              { id: 'e2', from: 'v2', to: 'v3' },
              { id: 'e3', from: 'v3', to: 'fim' },
            ],
          },
        },
      ],
    },
  ],
});

const file = (name: string, type = 'video/mp4', size = 1000) => ({ name, type, size });

describe('nome do arquivo', () => {
  it('ignora pasta, maiúsculas, espaços nas pontas e o .mp4', () => {
    expect(normalizeRecordingName('Tela-01.MP4')).toBe('tela-01');
    expect(normalizeRecordingName('  tela-01  ')).toBe('tela-01');
    expect(normalizeRecordingName('C:\\Videos\\Tela-01.mp4')).toBe('tela-01');
    expect(normalizeRecordingName('/tmp/x/tela-01.mp4')).toBe('tela-01');
    expect(normalizeRecordingName('tela 01.mov')).toBe('tela 01.mov');
    expect(normalizeRecordingName('.mp4')).toBe('');
  });
  it('acentos compostos e decompostos são o mesmo nome', () => {
    expect(normalizeRecordingName('configuração.mp4')).toBe(normalizeRecordingName('configuração.mp4'));
  });
});

describe('lista e estado', () => {
  const rows = listScreenRecordings(doc);
  it('lista aula · cena · arquivo na ordem do roteiro, só das cenas com gravação', () => {
    expect(rows.map((r) => `${r.lessonId}/${r.nodeId}/${r.index}/${r.fileName}`)).toEqual(['aula_1/v1/0/Tela-01.mp4', 'aula_1/v1/1/tela-02.MP4', 'aula_1/v2/0/tela-01.mp4']);
    expect(rows[2]!.nodeTitle).toBe('Cena sem título');
    expect(rows[0]!.lessonTitle).toBe('Aula 1');
  });
  it('estados: falta mídia, enviado, curta, cortada; pendente = tudo menos enviado', () => {
    expect(rows.map((r) => recordingState(r))).toEqual(['missing', 'short', 'trimmed']);
    expect(recordingState({ assetId: 'a' })).toBe('uploaded');
    expect(recordingState({ assetId: 'a', fit: 'ok' })).toBe('uploaded');
    expect(recordingState({ fit: 'short' })).toBe('missing');
    expect(rows.filter(isPendingRecording)).toHaveLength(3);
    expect(isPendingRecording({ assetId: 'a', fit: 'ok' })).toBe(false);
  });
  it('resumo: X de Y enviados e cenas prontas para montar', () => {
    expect(summarizeScreenRecordings(rows)).toEqual({ total: 3, uploaded: 2, missing: 1, attention: 2, scenes: 2, scenesReady: 1 });
    expect(summarizeScreenRecordings([])).toMatchObject({ total: 0, uploaded: 0, scenes: 0, scenesReady: 0 });
  });
});

describe('casamento por nome', () => {
  const rows = listScreenRecordings(doc);
  it('reconhece sem diferenciar maiúsculas, com ou sem .mp4', () => {
    const m = matchFilesToRecordings([file('TELA-02'), file('tela-02.mp4')], rows);
    expect(m.matched).toHaveLength(1);
    expect(m.matched[0]!.file.name).toBe('TELA-02');
    expect(m.duplicates.map((f) => f.name)).toEqual(['tela-02.mp4']);
  });
  it('nome repetido em duas cenas liga nas duas', () => {
    const m = matchFilesToRecordings([file('TELA-01.mp4')], rows);
    expect(m.matched[0]!.targets.map((t) => t.nodeId)).toEqual(['v1', 'v2']);
  });
  it('arquivo sem par é não reconhecido (e nada é ligado a ele)', () => {
    const m = matchFilesToRecordings([file('outro.mp4'), file('.mp4'), file('tela-01.mp4')], rows);
    expect(m.unrecognized.map((f) => f.name)).toEqual(['outro.mp4', '.mp4']);
    expect(m.matched).toHaveLength(1);
  });
  it('prepareBatch: reconhecido e válido espera; fora do tipo ou do tamanho é recusado; sem par não é enviado', () => {
    const items = prepareBatch([file('tela-01.mp4'), file('tela-02.mp4', 'video/quicktime'), file('nada.mp4'), file('Tela-01.mp4'), file('tela-03.mp4')], rows, 5000);
    expect(items.map((i) => i.status)).toEqual(['waiting', 'invalid', 'unrecognized', 'duplicate', 'unrecognized']);
    expect(items[0]!.targets).toHaveLength(2);
    const big = prepareBatch([file('tela-01.mp4', 'video/mp4', 6000)], rows, 5000);
    expect(big[0]!.status).toBe('invalid');
    expect(big[0]!.message).toMatch(/passa de/);
  });
});

describe('validação de tipo e tamanho', () => {
  const mb = 1024 * 1024;
  it('só video/mp4 (ou sem tipo) e dentro do limite', () => {
    expect(checkRecordingMeta({ type: 'video/mp4', size: 10 }, mb).ok).toBe(true);
    expect(checkRecordingMeta({ type: '', size: 10 }, mb).ok).toBe(true);
    expect(checkRecordingMeta({ type: 'video/webm', size: 10 }, mb)).toMatchObject({ ok: false, reason: 'type' });
    expect(checkRecordingMeta({ type: 'text/html', size: 10 }, mb)).toMatchObject({ ok: false, reason: 'type' });
    expect(checkRecordingMeta({ type: 'video/mp4', size: 0 }, mb)).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkRecordingMeta({ type: 'video/mp4', size: mb + 1 }, mb)).toMatchObject({ ok: false, reason: 'too_large', message: 'O arquivo passa de 1 MB.' });
  });
  it('assinatura ftyp nos bytes 4 a 7', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(hasMp4Signature(mp4)).toBe(true);
    expect(hasMp4Signature(new TextEncoder().encode('<html><body>oi</body>'))).toBe(false);
    expect(hasMp4Signature(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79]))).toBe(false);
  });
  it('limite por ambiente: padrão 1024 MB; valor inválido volta ao padrão', () => {
    expect(screenRecordingMaxBytes(undefined)).toBe(1024 * mb);
    expect(screenRecordingMaxBytes('')).toBe(1024 * mb);
    expect(screenRecordingMaxBytes('abc')).toBe(1024 * mb);
    expect(screenRecordingMaxBytes('0')).toBe(1024 * mb);
    expect(screenRecordingMaxBytes('-5')).toBe(1024 * mb);
    expect(screenRecordingMaxBytes('200')).toBe(200 * mb);
    expect(screenRecordingMaxBytes(' 2048 ')).toBe(2048 * mb);
  });
});

describe('aplicar o assetId no documento', () => {
  it('liga em todas as gravações de mesmo nome e zera fit/durationSec só nelas', () => {
    const { document, linked } = applyRecordingAsset(doc, 'TELA-01', 'ast_novo');
    expect(linked).toBe(2);
    const rows = listScreenRecordings(document);
    expect(rows[0]).toMatchObject({ assetId: 'ast_novo', fit: undefined, durationSec: undefined });
    expect(rows[2]).toMatchObject({ assetId: 'ast_novo', fit: undefined, durationSec: undefined });
    // a outra gravação não muda
    expect(rows[1]).toMatchObject({ assetId: 'ast_2', fit: 'short', durationSec: 8 });
    expect(CourseDocumentSchema.safeParse(document).success).toBe(true);
    // o original não é mutado
    expect(listScreenRecordings(doc)[2]).toMatchObject({ assetId: 'ast_old', fit: 'trimmed' });
  });
  it('reenviar uma gravação já enviada troca o asset e zera a medida antiga', () => {
    const { document } = applyRecordingAsset(doc, 'tela-02.mp4', 'ast_regravado');
    expect(listScreenRecordings(document)[1]).toMatchObject({ assetId: 'ast_regravado', fit: undefined, durationSec: undefined });
  });
  it('sem gravação com esse nome: devolve o mesmo documento', () => {
    const r = applyRecordingAsset(doc, 'nada.mp4', 'ast_x');
    expect(r.linked).toBe(0);
    expect(r.document).toBe(doc);
  });
});
