'use client';

import * as React from 'react';
import { Clapperboard } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { VideoStats } from './video-stats';
import { staleLabel } from './video-stats';

/** Contagem do estado da mídia vinda da validação do servidor (`validateDraft().media`). */
export interface MediaCounts {
  stale: number;
  simulated: number;
  missing: number;
  inProgress: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Modo do ambiente de mídia (demo = vídeo simulado é o esperado). `null` enquanto carrega. */
export function useMediaMode(): { demo: boolean | null } {
  const [demo, setDemo] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let alive = true;
    api<{ mode: 'demo' | 'real'; simulation: boolean }>('/api/media/capabilities')
      .then((c) => alive && setDemo(c.mode === 'demo' || c.simulation))
      .catch(() => alive && setDemo(false));
    return () => {
      alive = false;
    };
  }, []);
  return { demo };
}

/**
 * Confirmação de publicação (auditoria P1-2): antes de criar a versão, lista o
 * estado da mídia — desatualizados (texto/direção ou apresentação), simulados,
 * faltando, em produção — e os avisos editoriais. Vídeo simulado fora do modo
 * de demonstração exige marcar "Publicar mesmo assim"; em modo de demonstração
 * é só informado. Em linha (sem `window.confirm`): acessível e testável.
 */
export function PublishConfirm({
  revision,
  versionNumber,
  media,
  videos,
  warningsCount,
  busy,
  onConfirm,
  onCancel,
  error,
}: {
  revision: number;
  /** número da versão que será criada (se conhecido) */
  versionNumber?: number;
  media: MediaCounts;
  /** contagem do cliente (fila + rascunho), para o detalhe "pela apresentação" */
  videos?: VideoStats;
  warningsCount: number;
  busy: boolean;
  onConfirm: (opts: { allowSimulatedMedia: boolean }) => void;
  onCancel: () => void;
  error?: string | null;
}) {
  const { demo } = useMediaMode();
  const [allowSimulated, setAllowSimulated] = React.useState(false);
  const needsAccept = media.simulated > 0 && demo === false;
  const canConfirm = !busy && demo !== null && (!needsAccept || allowSimulated);
  const stale = videos && videos.stale === media.stale ? staleLabel(videos) : plural(media.stale, 'desatualizado', 'desatualizados');
  const items: Array<{ label: string; tone: 'ok' | 'warn' | 'bad' }> = [];
  if (videos && videos.total > 0) items.push({ label: `${videos.ready} de ${videos.total} ${videos.total === 1 ? 'cena com vídeo pronto' : 'cenas com vídeo pronto'}`, tone: videos.ready === videos.total ? 'ok' : 'warn' });
  if (media.stale > 0) items.push({ label: stale, tone: 'warn' });
  if (media.missing > 0) items.push({ label: plural(media.missing, 'cena sem vídeo', 'cenas sem vídeo'), tone: 'warn' });
  if (media.inProgress > 0) items.push({ label: plural(media.inProgress, 'vídeo em produção (o publicado fica sem ele)', 'vídeos em produção (o publicado fica sem eles)'), tone: 'warn' });
  if (media.simulated > 0) items.push({ label: `${plural(media.simulated, 'vídeo simulado', 'vídeos simulados')}${demo ? ' (modo de demonstração)' : ''}`, tone: demo ? 'warn' : 'bad' });

  return (
    <div role="region" aria-labelledby="publish-confirm-title" className="space-y-4 rounded-xl border border-accent/50 bg-accent-soft/40 p-4 text-sm" data-testid="publish-confirm">
      <div>
        <p id="publish-confirm-title" className="font-display text-base font-semibold text-fg">
          Publicar {versionNumber ? `a versão ${versionNumber}` : 'uma nova versão'} a partir da revisão {revision}?
        </p>
        <p className="text-fg-muted">Quem se matricular depois recebe exatamente esta versão. O rascunho continua editável.</p>
      </div>
      <div className="space-y-2" data-testid="publish-confirm-media">
        <p className="flex items-center gap-2 font-medium text-fg">
          <Clapperboard className="h-4 w-4 text-paid" aria-hidden="true" /> Vídeos nesta versão
        </p>
        {items.length === 0 ? (
          <p className="text-fg-muted">{videos && videos.total === 0 ? 'Nenhuma cena com texto para narrar.' : 'Todos os vídeos estão prontos e atualizados.'}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.label} className={cn('rounded-lg px-3 py-1.5', it.tone === 'ok' ? 'bg-success-soft text-success' : it.tone === 'warn' ? 'bg-paid-soft text-fg' : 'bg-danger-soft text-danger')}>
                {it.label}
              </li>
            ))}
          </ul>
        )}
        {warningsCount > 0 && <p className="text-xs text-fg-muted">{plural(warningsCount, 'aviso editorial será registrado', 'avisos editoriais serão registrados')} na versão.</p>}
      </div>
      {needsAccept && (
        <label className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-fg">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={allowSimulated} onChange={(e) => setAllowSimulated(e.target.checked)} data-testid="publish-allow-simulated" />
          <span>
            <span className="block font-medium">Publicar mesmo assim (vídeos de demonstração)</span>
            <span className="block text-xs text-fg-muted">Este ambiente gera vídeo real, mas {plural(media.simulated, 'cena ainda tem vídeo simulado', 'cenas ainda têm vídeo simulado')}. Os alunos veriam uma simulação. O normal é gerar os vídeos reais em "Produção de vídeo" antes de publicar.</span>
          </span>
        </label>
      )}
      {media.simulated > 0 && demo && <p className="text-xs text-fg-muted">Modo de demonstração: os vídeos simulados são o esperado deste ambiente e não bloqueiam a publicação.</p>}
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onConfirm({ allowSimulatedMedia: allowSimulated })} disabled={!canConfirm} data-testid="publish-confirm-button">
          {busy ? 'Publicando…' : 'Confirmar e publicar'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy} data-testid="publish-confirm-cancel">Cancelar</Button>
      </div>
    </div>
  );
}
