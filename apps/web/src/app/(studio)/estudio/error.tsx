'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Limite de erro do estúdio: uma tela que não quebrou vira um aviso com saída.
 * O rascunho fica no servidor (autosave); recarregar não perde o que foi salvo.
 */
export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10" role="alert" data-testid="studio-error">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger">
        <CircleAlert className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h1>Algo deu errado nesta tela</h1>
        <p className="text-fg-muted">O que você já salvou está guardado no servidor. Tente de novo; se repetir, volte à lista de cursos e abra o curso outra vez.</p>
        {error.digest && <p className="text-xs text-fg-faint">Código: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tentar de novo
        </Button>
        <Link href="/estudio" className={cn(buttonVariants({ variant: 'secondary' }))}>Ir para os cursos</Link>
      </div>
    </div>
  );
}
