/**
 * Títulos curtos de apresentação (vitrine, retomada e título principal da ficha), os mesmos das capas.
 * Camada só de apresentação, ligada aos ids reais dos cursos: o nome canônico continua no curso e aparece
 * na ficha como informação secundária. Curso fora da tabela usa o título completo.
 */
const SHORT_TITLES: Record<string, string> = {
  crs_5vccpfypr6fmxojb: 'Feedback sem medo', // Como receber uma correção de postura
  crs_8g0csi2hflfztfge: 'Conviver no trabalho', // Espaços compartilhados: você não está sozinho
  crs_bmf11akamtxoti28: 'Converse com confiança', // Como conversar com colegas e gestores
  crs_b8zeh4b2gguseghq: 'Respeite os limites', // Liberdade e intimidade são coisas diferentes
  crs_99hpdsc8w88osiuh: 'Meu primeiro dia', // Primeiro dia: como chegar preparado
  crs_gujuaiykqcsl2n31: 'Comece bem', // Comece bem: seus primeiros passos no trabalho
  crs_arbeohlw3xp5v3zx: 'O que vestir?', // Que roupa eu uso para trabalhar?
  crs_gjn468p3y6hwua4f: 'Antes de postar', // Redes sociais e bastidores do trabalho
  crs_q52zsimeeahpa9bq: 'Terminei. E agora?', // Acabou minha tarefa. E agora?
  crs_hd4jnnpx3oj0xf14: 'Celular no trabalho', // Celular no trabalho: quando pega mal?
  crs_4tj8a3q3g9gudgb7: 'Horário é combinado', // Horário é combinado
  crs_u4nfw88a4n2n0ubv: 'Posso perguntar?', // Não entendi a regra. Como pergunto?
  crs_4z17p0m6d43qxmmo: 'Mensagem profissional', // WhatsApp profissional sem passar vergonha
  crs_hvvgkvtd1rb2um0l: 'Primeira vaga', // Primeira Vaga
};

export function shortTitleFor(courseId: string, fullTitle: string): string {
  return SHORT_TITLES[courseId] ?? fullTitle;
}

/** Cursos das três capas do destaque (Feedback sem medo, Conviver no trabalho, Mensagem profissional). */
export const HERO_COURSE_IDS = ['crs_5vccpfypr6fmxojb', 'crs_8g0csi2hflfztfge', 'crs_4z17p0m6d43qxmmo'] as const;
