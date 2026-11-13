import { describe, expect, it } from 'vitest';
import { ALLOWED_MEDIA, checkTaskFile, sniffMime } from '../src';

const enc = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};
const MAX = 10 * 1024 * 1024;
const ALL = ['application/pdf', 'image/png', 'image/jpeg'];
const pdf = (body = 'conteudo') => enc(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${body}\ntrailer\n<< >>\n%%EOF\n`);
const png = () => concat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), new Uint8Array(64));
const jpeg = () => concat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(64), new Uint8Array([0xff, 0xd9]));
const check = (bytes: Uint8Array, accepted = ALL) => checkTaskFile(bytes, { maxBytes: MAX, accepted });

describe('sniffMime: PDF', () => {
  it('reconhece PDF pelos primeiros bytes, sem liberar PDF no upload de mídia do estúdio', () => {
    expect(sniffMime(pdf().subarray(0, 32))).toBe('application/pdf');
    expect(ALLOWED_MEDIA['application/pdf']).toBeUndefined();
    expect(sniffMime(enc('  %PDF-1.7'))).toBeNull();
  });
});

describe('checkTaskFile: arquivo de entrega do aluno', () => {
  it('aceita PDF, PNG e JPEG de verdade', () => {
    expect(check(pdf())).toEqual({ ok: true, mime: 'application/pdf', ext: 'pdf' });
    expect(check(png())).toEqual({ ok: true, mime: 'image/png', ext: 'png' });
    expect(check(jpeg())).toEqual({ ok: true, mime: 'image/jpeg', ext: 'jpg' });
  });

  it('recusa arquivo vazio e arquivo acima de 10 MB (11 MB)', () => {
    expect(check(new Uint8Array(0))).toMatchObject({ ok: false, reason: 'empty' });
    const big = new Uint8Array(11 * 1024 * 1024);
    big.set(pdf().subarray(0, 16));
    big.set(enc('%%EOF\n'), big.byteLength - 6);
    expect(check(big)).toMatchObject({ ok: false, reason: 'too_large', message: 'O arquivo passa de 10 MB.' });
    const exact = new Uint8Array(MAX);
    exact.set(pdf().subarray(0, 16));
    exact.set(enc('%%EOF\n'), exact.byteLength - 6);
    expect(check(exact).ok).toBe(true);
  });

  it('recusa executável, HTML, script, SVG e ZIP, qualquer que seja o nome do arquivo', () => {
    const exe = concat(enc('MZ'), new Uint8Array(200));
    const elf = concat(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), new Uint8Array(200));
    const zip = concat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), new Uint8Array(200));
    for (const bad of [exe, elf, zip, enc('<!doctype html><script>alert(1)</script>'), enc('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), enc('#!/bin/sh\nrm -rf /\n')]) {
      expect(check(bad)).toMatchObject({ ok: false, reason: 'type' });
    }
  });

  it('recusa disfarces: cabeçalho de PDF sem o fim do PDF, e PNG com a assinatura incompleta', () => {
    // executável com "%PDF-" na frente
    expect(check(concat(enc('%PDF-1.4\n'), enc('MZ'), new Uint8Array(4000)))).toMatchObject({ ok: false, reason: 'type' });
    // "%PDF-" que não está no começo do arquivo
    expect(check(concat(enc('MZ\n%PDF-1.4\n'), enc('%%EOF')))).toMatchObject({ ok: false, reason: 'type' });
    // os 4 primeiros bytes de PNG, mas não a assinatura de 8
    expect(check(concat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), enc('<script>alert(1)</script>')))).toMatchObject({ ok: false, reason: 'type' });
  });

  it('recusa tipo de mídia que a plataforma conhece, mas a entrega não aceita (MP4, WebP)', () => {
    const mp4 = concat(new Uint8Array([0, 0, 0, 0x18]), enc('ftypmp42'), new Uint8Array(100));
    const webp = concat(enc('RIFF'), new Uint8Array(4), enc('WEBP'), new Uint8Array(100));
    expect(check(mp4)).toMatchObject({ ok: false, reason: 'type' });
    expect(check(webp)).toMatchObject({ ok: false, reason: 'type' });
  });

  it('respeita os tipos que a tarefa aceita', () => {
    expect(check(png(), ['application/pdf'])).toMatchObject({ ok: false, reason: 'type', message: 'Tipo de arquivo não aceito. Envie PDF.' });
    expect(check(pdf(), ['image/png', 'image/jpeg'])).toMatchObject({ ok: false, reason: 'type', message: 'Tipo de arquivo não aceito. Envie PNG ou JPEG.' });
    expect(check(pdf(), [])).toMatchObject({ ok: false, reason: 'type' });
  });
});
