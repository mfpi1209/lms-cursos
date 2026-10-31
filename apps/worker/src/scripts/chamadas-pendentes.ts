/** Imprime, em JSON, os vídeos que ganharam a chamada para a pergunta e ainda tocam a fala antiga (por curso). Só leitura. */
import { callStatuses } from '@lms/course-schema';
import { createDb, authoring } from '@lms/db';

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const draft = (await authoring.getDraft(db, process.argv[2]!))!;
    const ids = new Set<string>();
    for (const m of draft.document.modules) for (const l of m.lessons) for (const st of callStatuses(l.graph)) if (st.hostId && st.needsRecording) ids.add(st.hostId);
    console.log(JSON.stringify([...ids]));
  } finally { await close(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
