// Processo auxiliar do rasterizador SVG (ver raster.ts). Roda o resvg FORA do processo principal:
// o resvg é Rust nativo e, num SVG de geometria inesperada, dá pânico `unwrap() on None` que
// vira ABORT do processo inteiro (não é exceção JS). Aqui um pânico só derruba este filho; o pai
// recebe o erro, devolve `SvgRenderError` ao job e sobe outro filho.
//
// Dois modos:
//  - fork (IPC): { id, svg, background, pixels } -> { id, ok, png, width, height, pixels? }
//  - `--once` (spawnSync): JSON { svg, background, pixels } no stdin -> JSON com base64 no stdout
import { Resvg } from '@resvg/resvg-js';

// Sem fontes do sistema: os SVG daqui vêm do satori (texto já em caminhos) ou são só imagens. Carregar as
// fontes do sistema custa ~50 ms por desenho (macOS) e não é usado.
function render({ svg, background, pixels }) {
  const r = new Resvg(svg, { fitTo: { mode: 'original' }, background: background ?? 'rgba(0,0,0,0)', font: { loadSystemFonts: false } }).render();
  const png = r.asPng();
  return { png, width: r.width, height: r.height, ...(pixels ? { pixels: r.pixels } : {}) };
}

if (process.argv.includes('--once')) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const out = render(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    process.stdout.write(JSON.stringify({ width: out.width, height: out.height, png: Buffer.from(out.png).toString('base64'), ...(out.pixels ? { pixels: Buffer.from(out.pixels).toString('base64') } : {}) }));
  });
} else {
  process.on('disconnect', () => process.exit(0));
  process.on('message', (m) => {
    try {
      process.send({ id: m.id, ok: true, ...render(m) });
    } catch (e) {
      process.send({ id: m.id, ok: false, error: String(e && e.message ? e.message : e) });
    }
  });
  process.send({ ready: true });
}
