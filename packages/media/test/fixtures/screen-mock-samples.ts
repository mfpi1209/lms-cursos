import type { MockInput } from '../../src/compose/screen-mock';

/** Um exemplo realista por modelo (conteúdo pt-BR dos cursos); usados nos testes e para gerar as amostras. */
export const SCREEN_MOCK_SAMPLES: Record<MockInput['model'], MockInput & { durationSec: number }> = {
  chat: {
    model: 'chat',
    device: 'phone',
    app: 'Assistente de IA',
    durationSec: 11,
    steps: [
      { kind: 'type', text: 'me explica marketing', weight: 1.2 },
      { kind: 'message', from: 'ai', text: 'Marketing é o conjunto de ações que uma empresa usa para atrair, convencer e manter clientes. Envolve produto, preço, divulgação e distribuição, e vale para qualquer negócio, grande ou pequeno.', weight: 3 },
      { kind: 'highlight', text: 'qualquer negócio', weight: 1 },
      { kind: 'type', text: 'sou dona de uma loja de roupas, 28 anos de cidade pequena, quero vender mais pelo Instagram', weight: 1.5 },
      { kind: 'message', from: 'ai', text: 'Ótimo! Com esse contexto posso sugerir 3 ideias de posts para a sua loja, pensando no público da sua cidade.', weight: 2 },
    ],
  },
  browser: {
    model: 'browser',
    device: 'phone',
    app: 'Busca de vagas',
    durationSec: 10,
    steps: [
      { kind: 'type', text: 'vaga assistente administrativo remoto', weight: 1.5 },
      { kind: 'show', title: 'Assistente Administrativo (Home Office)', lines: ['Empresa Aurora Serviços · Remoto', 'Publicada há 2 dias · 24 candidaturas'], weight: 1.5 },
      { kind: 'show', title: 'Auxiliar Administrativo Júnior', lines: ['Grupo Horizonte · Híbrido', 'Publicada há 5 dias'], weight: 1.5 },
      { kind: 'tap', label: 'Assistente Administrativo (Home Office)', weight: 1.2 },
      { kind: 'highlight', text: 'Remoto', weight: 1 },
    ],
  },
  form: {
    model: 'form',
    device: 'phone',
    app: 'Perfil profissional',
    durationSec: 10,
    steps: [
      { kind: 'show', title: 'Título', lines: ['Como as pessoas vão ver você logo abaixo do seu nome'], weight: 1 },
      { kind: 'type', text: 'Assistente administrativa | Organização e atendimento ao cliente', weight: 3 },
      { kind: 'highlight', text: 'Organização e atendimento', weight: 1.2 },
      { kind: 'tap', label: 'Salvar', weight: 1.3 },
    ],
  },
  settings: {
    model: 'settings',
    device: 'phone',
    app: 'Segurança da conta',
    durationSec: 9,
    steps: [
      { kind: 'show', title: 'Proteja o seu acesso', lines: ['Além da senha, você confirma o login com um código.'], weight: 1.5 },
      { kind: 'toggle', label: 'Verificação em duas etapas', on: true, weight: 2 },
      { kind: 'toggle', label: 'Avisar sobre logins novos', on: true, weight: 1.5 },
      { kind: 'tap', label: 'Verificação em duas etapas', weight: 1 },
    ],
  },
  calendar: {
    model: 'calendar',
    device: 'phone',
    app: 'Agenda',
    durationSec: 9,
    steps: [
      { kind: 'type', text: 'Bloco de estudo', weight: 1.5 },
      { kind: 'event', title: 'Bloco de estudo', day: 'seg', time: '19:00', color: 'azul', weight: 2.5 },
      { kind: 'show', title: 'Combinado', lines: ['Toda segunda, 1 hora de estudo sem distrações.'], weight: 2 },
    ],
  },
  sheet: {
    model: 'sheet',
    device: 'phone',
    app: 'Planilha de gastos',
    durationSec: 12,
    steps: [
      { kind: 'cell', ref: 'A1', value: 'Item', weight: 1 },
      { kind: 'cell', ref: 'B1', value: 'Valor', weight: 1 },
      { kind: 'cell', ref: 'A2', value: 'Aluguel', weight: 1 },
      { kind: 'cell', ref: 'B2', value: 'R$ 1.200,00', weight: 1.2 },
      { kind: 'cell', ref: 'A3', value: 'Mercado', weight: 1 },
      { kind: 'cell', ref: 'B3', value: 'R$ 640,50', weight: 1.2 },
      { kind: 'cell', ref: 'A4', value: 'Transporte', weight: 1 },
      { kind: 'cell', ref: 'B4', value: 'R$ 180,00', weight: 1.2 },
      { kind: 'cell', ref: 'A5', value: 'Total', weight: 1 },
      { kind: 'cell', ref: 'B5', value: '=SOMA(B2:B4)', weight: 2.5 },
    ],
  },
  notes: {
    model: 'notes',
    device: 'phone',
    app: 'Anotações',
    durationSec: 10,
    steps: [
      { kind: 'show', title: 'Reunião de alinhamento', lines: ['Participantes: Ana, Bruno e Carla', 'Data: terça, 14h'], weight: 2 },
      { kind: 'type', text: 'Decidimos publicar o catálogo novo até sexta-feira.', weight: 2.5 },
      { kind: 'show', title: 'Próximos passos', lines: ['Ana revisa os textos', 'Bruno envia as fotos', 'Carla publica no site'], weight: 3 },
      { kind: 'highlight', text: 'até sexta-feira', weight: 1 },
    ],
  },
};
