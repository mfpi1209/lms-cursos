/**
 * Modo de DEMONSTRAÇÃO: provedores simulados, explicitamente identificados.
 * - voz simulada: gera um WAV real de silêncio com duração proporcional ao texto
 * - vídeo simulado: não produz arquivo (não existe como "pronto"); o job termina
 *   como `succeeded` com `simulated=1` e sem asset, e a interface mostra isso.
 */
export function simulatedSilenceWav(seconds: number, sampleRate = 8000): Uint8Array {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);
  return new Uint8Array(buf);
}

/** ~150 palavras por minuto -> duração estimada da narração. */
export function estimateNarrationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 150) * 60));
}
