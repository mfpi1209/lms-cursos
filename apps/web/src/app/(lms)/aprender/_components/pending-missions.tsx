'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Footprints } from 'lucide-react';
import { MISSION_LABELS } from '@lms/course-schema';
import { MissionLogger } from '@/components/player/mission-logger';

export interface PendingMissionItem {
  nodeId: string;
  lessonId: string;
  lessonTitle: string;
  /** posição da aula no curso (base 0) */
  lessonIndex: number;
  title: string;
  action: string;
  alternative: string;
  revision: number;
}

/**
 * "Missões para depois": as missões "Leve para a vida real" que a pessoa deixou para depois ("Vou fazer depois"),
 * para achar e marcar "Já experimentei" (e contar o que percebeu) sem reabrir a aula. Não é pendência do curso: ele
 * segue concluído/em andamento do mesmo jeito. Ao registrar, a missão fica na lista até recarregar, já com a confirmação.
 */
export function PendingMissions({ enrollmentId, items }: { enrollmentId: string; items: PendingMissionItem[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  if (items.length === 0) return null;
  const left = items.filter((i) => !done.has(i.nodeId)).length;
  return (
    <section aria-labelledby="missions-heading" data-testid="pending-missions" className="space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Footprints className="size-5" />
        </span>
        <div>
          <h2 id="missions-heading" className="text-[28px] leading-tight text-fg">
            Missões para depois
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted" data-testid="pending-missions-count">
            {left === 0 ? 'Tudo registrado. Obrigado por levar a aula para a vida real.' : `${left} ${left === 1 ? 'missão' : 'missões'} para fazer quando der. Elas não travam o curso.`}
          </p>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((m) => (
          <li key={m.nodeId} data-testid={`pending-mission-${m.nodeId}`} className="panel space-y-3 p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                <Link href={`/aprender/${enrollmentId}/aulas/${m.lessonId}/rever`} className="underline-offset-4 hover:underline">
                  Aula {m.lessonIndex + 1} · {m.lessonTitle}
                </Link>
              </p>
              <h3 className="mt-1 text-lg font-semibold leading-snug text-fg">{m.title === MISSION_LABELS.moment ? m.action : m.title}</h3>
              {m.title !== MISSION_LABELS.moment && <p className="mt-1 text-base leading-relaxed text-fg/85">{m.action}</p>}
            </div>
            <details className="text-sm text-fg-muted">
              <summary className="min-h-8 cursor-pointer select-none font-medium text-fg">Se você ainda não trabalha</summary>
              <p className="mt-1 leading-relaxed">{m.alternative}</p>
            </details>
            <MissionLogger
              enrollmentId={enrollmentId}
              nodeId={m.nodeId}
              initial={{ status: 'later', note: null, revision: m.revision }}
              onSaved={(r) => r.status === 'done' && setDone((prev) => new Set(prev).add(m.nodeId))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
