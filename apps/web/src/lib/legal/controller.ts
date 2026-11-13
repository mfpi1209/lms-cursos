/**
 * Quem é o CONTROLADOR dos dados dos alunos de um workspace de cliente (LGPD, art. 5, VI): a instituição de ensino que decide a
 * finalidade e tem a relação com o aluno. A DNA Work é a OPERADORA (art. 5, VII) e trata os dados em nome dela.
 *
 * Os dados do controlador são do cliente, não do código. Ficam em variáveis de ambiente do deploy daquele cliente (sem migração; as
 * páginas legais são públicas, sem workspace logado). Variável vazia ou ausente mostra o marcador `[CONTROLADOR: ...]` na página,
 * de modo que o rascunho nunca inventa um nome ou CNPJ. Quem assina como controlador no piloto depende do contrato (jurídico).
 */
export interface LegalController {
  nome: string;
  cnpj: string;
  endereco: string;
  contato: string;
  encarregadoNome: string;
  encarregadoContato: string;
}

const FALLBACK: LegalController = {
  nome: '[CONTROLADOR: nome]',
  cnpj: '[CONTROLADOR: CNPJ]',
  endereco: '[CONTROLADOR: endereço]',
  contato: '[CONTROLADOR: e-mail de contato]',
  encarregadoNome: '[ENCARREGADO: nome]',
  encarregadoContato: '[ENCARREGADO: e-mail de contato]',
};

/** Uma linha só, sem chaves (um valor de ambiente não vira outro marcador), com tamanho limitado. */
function clean(v: string | undefined): string {
  return (v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[{}]/g, '').trim().slice(0, 300);
}

export function legalControllerFromEnv(env: Record<string, string | undefined> = process.env): LegalController {
  const pick = (k: string, fb: string) => clean(env[k]) || fb;
  return {
    nome: pick('LEGAL_CONTROLLER_NAME', FALLBACK.nome),
    cnpj: pick('LEGAL_CONTROLLER_CNPJ', FALLBACK.cnpj),
    endereco: pick('LEGAL_CONTROLLER_ADDRESS', FALLBACK.endereco),
    contato: pick('LEGAL_CONTROLLER_CONTACT', FALLBACK.contato),
    encarregadoNome: pick('LEGAL_DPO_NAME', FALLBACK.encarregadoNome),
    encarregadoContato: pick('LEGAL_DPO_CONTACT', FALLBACK.encarregadoContato),
  };
}

/** Troca `{{CONTROLADOR_NOME}}` etc. do markdown pelos dados do controlador. Chave desconhecida fica como está (um teste a pega). */
export function applyLegalController(source: string, c: LegalController): string {
  const map: Record<string, string> = {
    CONTROLADOR_NOME: c.nome,
    CONTROLADOR_CNPJ: c.cnpj,
    CONTROLADOR_ENDERECO: c.endereco,
    CONTROLADOR_CONTATO: c.contato,
    ENCARREGADO_NOME: c.encarregadoNome,
    ENCARREGADO_CONTATO: c.encarregadoContato,
  };
  return source.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => map[k] ?? m);
}
