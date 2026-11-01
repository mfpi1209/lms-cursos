'use client';

import { RefreshCw } from 'lucide-react';

/** Falha ao carregar uma página da área do aluno: mensagem clara e "Tentar novamente" (sem perder o resto do cabeçalho). */
export default function LearnerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="lms-editorial mx-auto max-w-[560px] py-10 text-center" role="alert" data-testid="learner-error">
      <h1 className="text-[28px]! font-extrabold! leading-9! text-fg">Não foi possível carregar</h1>
      <p className="mt-2 text-base text-fg-muted">Algo falhou ao abrir esta página. Seus cursos e seu progresso continuam salvos.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-[12px] bg-accent-fill px-5 text-[16px] font-semibold text-accent-fill-fg hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--dna-focus)]"
      >
        <RefreshCw className="size-5" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}
