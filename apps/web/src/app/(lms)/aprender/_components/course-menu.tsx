'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ListVideo, Menu, RotateCcw, SkipBack } from 'lucide-react';
import { CourseRecapButton } from '@/components/player/immersive/recap-drawer';
import type { PlatformContext } from '@/components/player/types';
import { cn } from '@/lib/utils';

const ITEM =
  'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[16px] font-medium text-fg hover:bg-fg/8 focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-accent';

/**
 * "☰ Opções" da capa do curso: as ações que não são o caminho principal
 * (reiniciar a aula, recomeçar do início, capítulos, meu roteiro). Fecha com
 * Esc, clique fora ou ao escolher; o foco volta ao botão.
 */
export function CourseMenu({
  restartLesson,
  restartFromStart,
  chaptersHref,
  recap,
  enrollmentId,
  className,
}: {
  /** reiniciar a aula em andamento (rótulo e link) */
  restartLesson?: { label: string; href: string };
  /** recomeçar o curso pela aula 1, do zero (o histórico fica guardado) */
  restartFromStart?: string;
  chaptersHref: string;
  recap?: PlatformContext['recap'];
  enrollmentId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    // foco no primeiro item ao abrir
    root.current?.querySelector<HTMLElement>('[data-menu-item]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        data-testid="course-menu"
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[12px] border border-white/40 bg-white/10 px-6 text-[17px] font-semibold text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Menu className="size-5" aria-hidden="true" />
        Opções
      </button>
      {/* sempre montado (só escondido): o "Meu roteiro" abre uma gaveta que precisa continuar viva com o menu fechado */}
      {(
        <div
          hidden={!open}
          id={menuId}
          role="group"
          aria-label="Opções do curso"
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(320px,calc(100vw-48px))] rounded-[16px] border border-line bg-surface p-2 text-fg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]"
        >
          {restartLesson && (
            <Link href={restartLesson.href} className={ITEM} data-menu-item data-testid="course-restart" onClick={() => setOpen(false)}>
              <RotateCcw className="size-5 text-fg-muted" aria-hidden="true" />
              {restartLesson.label}
            </Link>
          )}
          {restartFromStart && (
            <Link href={restartFromStart} className={ITEM} data-menu-item data-testid="course-restart-all" onClick={() => setOpen(false)}>
              <SkipBack className="size-5 text-fg-muted" aria-hidden="true" />
              <span>
                Recomeçar do início
                <span className="block text-[13px] font-normal text-fg-muted">Abre a aula 1 do zero. O que você já fez fica guardado.</span>
              </span>
            </Link>
          )}
          <a href={chaptersHref} className={ITEM} data-menu-item onClick={() => setOpen(false)}>
            <ListVideo className="size-5 text-fg-muted" aria-hidden="true" />
            Capítulos
          </a>
          {recap && <CourseRecapButton recap={recap} enrollmentId={enrollmentId} className={ITEM} />}
        </div>
      )}
    </div>
  );
}
