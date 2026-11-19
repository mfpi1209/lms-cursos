/** Guardas do modo `--confirmar` do script gerar-curso (puras, testáveis sem banco nem provedor). */
export type GuardInput = {
  simulation: boolean;
  totalUsd: number;
  maxUsd: number;
  sceneErrors: number;
  openJobs: number;
  /** resultado de `mediaBudgetCheck` para o total (teto diário do workspace) */
  budget: { exceeded: boolean; limitUsd: number | null; spentUsd: number; remainingUsd: number | null };
  toProduce: number;
};

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

/** Lista de motivos para recusar; vazia = pode criar orçamento e lote. */
export function refusalReasons(g: GuardInput): string[] {
  const r: string[] = [];
  if (g.simulation) r.push('simulação ativa: provedores pagos não liberados neste processo (ALLOW_PAID_PROVIDERS=1 e chaves no ambiente); o lote geraria só vídeos simulados');
  if (g.sceneErrors > 0) r.push(`${g.sceneErrors} cena(s) com erro de resolução; corrija o curso antes`);
  if (g.openJobs > 0) r.push(`o curso já tem ${g.openJobs} job(s) aberto(s) (queued/running); aguarde ou cancele`);
  if (g.toProduce === 0) r.push('nenhuma cena a produzir');
  if (!(g.maxUsd > 0)) r.push('--max-usd inválido');
  else if (g.totalUsd > g.maxUsd) r.push(`total ${usd(g.totalUsd)} acima do --max-usd ${usd(g.maxUsd)}`);
  if (g.budget.exceeded) r.push(`estoura o teto diário de mídia do workspace (teto ${g.budget.limitUsd === null ? 'n/a' : usd(g.budget.limitUsd)}, já comprometido ${usd(g.budget.spentUsd)}, restante ${g.budget.remainingUsd === null ? 'n/a' : usd(g.budget.remainingUsd)})`);
  return r;
}

export function maskEmail(email: string): string {
  const [u = '', d = ''] = email.split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

export type Args = { course: string; maxUsd: number; confirmar: boolean; /** ids de nó (v01,q01~a…): só essas cenas, mesmo com vídeo atualizado; ausente = todas as pendentes */ cenas?: string[] };

export function parseArgs(argv: string[]): Args {
  let course = '';
  let max = NaN;
  let confirmar = false;
  let cenas: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--course') course = argv[++i] ?? '';
    else if (a === '--max-usd') max = Number(argv[++i]);
    else if (a === '--confirmar') confirmar = true;
    else if (a === '--cenas') {
      const ids = (argv[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!ids.length) throw new Error('--cenas precisa de ids de cena separados por vírgula (ex.: v01,v02,q01~a)');
      cenas = [...new Set(ids)];
    }
    else if (a === '--seco') { /* padrão */ }
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (argv.includes('--seco') && confirmar) throw new Error('use --seco OU --confirmar, não os dois');
  if (!course) throw new Error('--course <id> é obrigatório');
  if (!Number.isFinite(max) || max <= 0) throw new Error('--max-usd <n> é obrigatório (número > 0)');
  return { course, maxUsd: max, confirmar, ...(cenas ? { cenas } : {}) };
}
