/**
 * Nome de apresentação dos cursos (vitrine, retomada, topo do player e ficha). Desde os nomes finais
 * (docs/qa/enriquecimento/brief.md, seção 5) é o mesmo nome do curso (`courses.title`); a tabela continua ligada
 * aos ids reais para o player mostrar o nome novo mesmo quando a versão publicada ainda traz o antigo (a
 * publicação traz o resto). O comentário de cada linha é o nome anterior. Curso fora da tabela usa o título completo.
 */
const SHORT_TITLES: Record<string, string> = {
  crs_5vccpfypr6fmxojb: 'Recebi uma correção. E agora?', // era: Como receber uma correção de postura
  crs_8g0csi2hflfztfge: 'O espaço também é do outro', // era: Espaços compartilhados: você não está sozinho
  crs_bmf11akamtxoti28: 'Como falar com a equipe', // era: Como conversar com colegas e gestores
  crs_b8zeh4b2gguseghq: 'Brincadeiras têm limite', // era: Liberdade e intimidade são coisas diferentes
  crs_99hpdsc8w88osiuh: 'Meu primeiro dia', // era: Primeiro dia: como chegar preparado
  crs_gujuaiykqcsl2n31: 'Comecei a trabalhar', // era: Comece bem: seus primeiros passos no trabalho
  crs_arbeohlw3xp5v3zx: 'Que roupa eu uso?', // era: Que roupa eu uso para trabalhar?
  crs_gjn468p3y6hwua4f: 'Posso postar isso?', // era: Redes sociais e bastidores do trabalho
  crs_q52zsimeeahpa9bq: 'Terminei. E agora?', // era: Acabou minha tarefa. E agora?
  crs_hd4jnnpx3oj0xf14: 'Celular no trabalho', // era: Celular no trabalho: quando pega mal?
  crs_4tj8a3q3g9gudgb7: 'Horário é combinado', // era: Horário é combinado
  crs_u4nfw88a4n2n0ubv: 'Não entendi. Posso perguntar?', // era: Não entendi a regra. Como pergunto?
  crs_4z17p0m6d43qxmmo: 'WhatsApp sem complicação', // era: WhatsApp profissional sem passar vergonha
  crs_hvvgkvtd1rb2um0l: 'Minha primeira vaga', // era: Primeira Vaga
};

export function shortTitleFor(courseId: string, fullTitle: string): string {
  return SHORT_TITLES[courseId] ?? fullTitle;
}

/** Cursos das três capas do destaque (Recebi uma correção. E agora?, O espaço também é do outro, WhatsApp sem complicação). */
export const HERO_COURSE_IDS = ['crs_5vccpfypr6fmxojb', 'crs_8g0csi2hflfztfge', 'crs_4z17p0m6d43qxmmo'] as const;

/** Banners do destaque do Explorar (marinho à esquerda, instrutor à direita), em `public/destaque/<curso>.webp`, na ordem do carrossel. */
export const HERO_BANNER_COURSE_IDS = [
  'crs_5vccpfypr6fmxojb', // Helena · Recebi uma correção. E agora? (antes: Feedback sem medo)
  'crs_4z17p0m6d43qxmmo', // Thiago · WhatsApp sem complicação (antes: Mensagem profissional)
  'crs_8g0csi2hflfztfge', // Aline · O espaço também é do outro (antes: Conviver no trabalho)
  'crs_bmf11akamtxoti28', // Gustavo · Como falar com a equipe (antes: Converse com confiança)
  'crs_4tj8a3q3g9gudgb7', // Júlia · Horário é combinado
  'crs_gjn468p3y6hwua4f', // Enzo · Posso postar isso? (antes: Antes de postar)
] as const;
