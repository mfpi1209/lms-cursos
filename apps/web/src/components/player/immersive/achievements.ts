/**
 * Conquistas do fim da aula, contadas do que o aluno FEZ, não do que visitou:
 *  - decisões: perguntas (`choice`) no caminho;
 *  - práticas: atividades "Na prática" (`reflection`) com resposta SALVA e não vazia. "Fazer depois" envia o texto vazio
 *    (o motor grava `answers[id] = { text: '' }`), então quem pulou não ganha "Prática feita";
 *  - práticas para depois: atividades visitadas sem resposta salva (mostradas em tom neutro, sem cobrança);
 *  - vida real: a missão "Leve para a vida real" (`mission`) é OUTRA coisa (acontece fora da plataforma). O chip dela diz
 *    "Vida real: já experimentei" ou "Vida real: para depois", conforme o que a pessoa marcou na aula;
 *  - revisão: a aula teve ao menos uma verificação (`assessment`) no caminho.
 * "Missão" fica só para a vida real: os chips da prática não usam essa palavra.
 */
export interface LessonAchievements {
  choices: number;
  /** atividades "Na prática" com resposta salva */
  practices: number;
  /** atividades "Na prática" que o aluno viu e deixou para depois */
  skippedPractices: number;
  reviews: number;
  /** só quando a aula tem missão "Leve para a vida real" no caminho: marcada como feita ("done") ou deixada para depois ("later") */
  realLife?: 'done' | 'later';
}

interface NodeLike {
  id: string;
  type: string;
}
interface StateLike {
  path: ReadonlyArray<{ nodeId: string }>;
  answers: Readonly<Record<string, { text?: string; missionStatus?: string } | undefined>>;
}

/**
 * `missionStatus`: o que o SERVIDOR deixou valendo em cada missão (por cena). Ele manda sobre a tentativa: o servidor não
 * rebaixa "Já experimentei" para "Vou fazer depois", então o chip final tem de ler o mesmo estado do Meu roteiro.
 */
export function lessonAchievements(nodes: ReadonlyArray<NodeLike>, state: StateLike, missionStatus: Readonly<Record<string, string | undefined>> = {}): LessonAchievements {
  const visited = new Set(state.path.map((p) => p.nodeId));
  const seen = (type: string) => nodes.filter((n) => n.type === type && visited.has(n.id));
  const reflections = seen('reflection');
  const practices = reflections.filter((n) => (state.answers[n.id]?.text ?? '').trim().length > 0).length;
  const missions = seen('mission');
  const realLife = missions.length > 0 ? (missions.every((n) => (missionStatus[n.id] ?? state.answers[n.id]?.missionStatus) === 'done') ? 'done' : 'later') : undefined;
  return {
    choices: seen('choice').length,
    practices,
    skippedPractices: reflections.length - practices,
    reviews: seen('assessment').length > 0 ? 1 : 0,
    ...(realLife ? { realLife } : {}),
  };
}

/** texto do chip da prática ("Na prática"): "Prática feita" só para quem salvou; quem deixou para depois lê algo neutro */
export function practiceChipLabel(a: Pick<LessonAchievements, 'practices' | 'skippedPractices'>): { label: string; done: boolean } | null {
  if (a.practices > 0) return { label: a.practices === 1 ? 'Prática feita' : `${a.practices} práticas feitas`, done: true };
  if (a.skippedPractices > 0) return { label: a.skippedPractices === 1 ? 'Prática para depois' : `${a.skippedPractices} práticas para depois`, done: false };
  return null;
}

/** texto do chip da missão "Leve para a vida real": o estado que a pessoa marcou; sem missão no caminho, sem chip */
export function realLifeChipLabel(a: Pick<LessonAchievements, 'realLife'>): { label: string; done: boolean } | null {
  if (a.realLife === 'done') return { label: 'Vida real: já experimentei', done: true };
  if (a.realLife === 'later') return { label: 'Vida real: para depois', done: false };
  return null;
}
