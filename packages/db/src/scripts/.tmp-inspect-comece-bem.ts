import { readFileSync } from 'node:fs';
import { importMarkdownCourse, spokenWords, stripBold } from '@lms/course-schema';
const md = readFileSync('docs/roteiros/curso-comece-bem.md', 'utf8');
const r = importMarkdownCourse(md, { presentation: { cameras: [] } as any, branding: { wordmark: 'Comece bem' } });
for (const m of r.parsed.modules) for (const l of m.lessons) {
  const c = { v: 0, q: 0, m: 0, av: 0, fim: 0 };
  for (const s of l.scenes) {
    if (s.kind === 'video') { c.v++; console.log(`  ${s.code} fala ${spokenWords(s.narration).length} palavras; tela ${spokenWords(s.screenText).length}${s.card ? `; cartão "${s.card.title}" ${s.card.bullets.map((b) => `[${spokenWords(stripBold(b)).length}w bold=${/\*\*/.test(b)}]`).join(' ')}` : ''}`); }
    if (s.kind === 'decision') { c.q++; console.log(`  ${s.code} pergunta ${spokenWords(s.title).length}w; opções ${s.options.map((o) => spokenWords(o.label).length).join('/')}; feedback ${s.options.map((o) => spokenWords(o.feedback).length).join('/')}`); }
    if (s.kind === 'scaffold') c.m++;
    if (s.kind === 'assessment') c.av++;
    if (s.kind === 'end') { c.fim++; console.log(`  FIM takeaways ${s.takeaways.length}, myScript ${JSON.stringify(s.myScript)}, checklist ${JSON.stringify(s.checklist)}`); }
  }
  console.log(`aula ${l.number}: ${JSON.stringify(c)} total ${l.scenes.length}`);
}
for (const m of r.document.modules) for (const l of m.lessons) for (const n of l.graph.nodes) if (n.type === 'end') console.log(l.id, n.id, JSON.stringify((n as any).recap?.map((x: any) => [x.kind, x.label, x.nodeId ?? ''])));
console.log('tagline:', r.document.branding.tagline);
