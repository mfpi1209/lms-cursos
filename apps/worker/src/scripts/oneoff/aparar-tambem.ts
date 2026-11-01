/** M10 da auditoria: C14·A3·v05 s3 começa com "Também" órfão (o item anterior foi cortado). Tira só a palavra (grátis). */
import { adjustScene } from '../../adjust';
adjustScene({ courseId: 'crs_hvvgkvtd1rb2um0l', lessonId: 'aula_03', nodeId: 'v05', request: { trimLead: [{ shotId: 's3', words: 1 }] } })
  .then((r) => { console.log(`[também] C14·A3·v05: ${r.durationSeconds.toFixed(1)} s`); process.exit(0); }, (e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
