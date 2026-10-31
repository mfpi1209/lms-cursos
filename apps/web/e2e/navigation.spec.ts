import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { courseIdBySlug, login } from './helpers';

/**
 * Navegação do aluno (voltar cena, mapa da aula, atalhos, página do curso) e
 * modo de teste do autor ("Testar a partir daqui", pular para cena, lista de
 * vídeos). Usa o curso "Pode entrar" que o seed do e2e publica no banco isolado
 * (`lms_cursos_e2e`); o id é lido pelo slug, nunca fixado.
 * Nada aqui chama IA nem gera mídia; no estúdio só se usa a prévia (sem estado).
 */
const PODE_ENTRAR_SLUG = 'pode-entrar';
const SCREENS = path.resolve(process.cwd(), '../../docs/qa/screens');
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SCREENS, name) });

async function nodeIs(page: Page, id: string) {
  await expect(page.getByTestId('player-node')).toHaveAttribute('data-node-id', id);
}

async function choose(page: Page, optionId: string) {
  await page.getByTestId(`option-${optionId}`).click();
  await page.getByTestId('player-submit').click();
}

/** Texto de um item do "Meu roteiro" (gaveta do player). */
async function recapItem(page: Page, itemId: string) {
  await page.getByTestId('open-recap').click();
  const drawer = page.getByTestId('recap-drawer');
  await expect(drawer).toBeVisible();
  const text = await drawer.getByTestId(`recap-item-${itemId}`).innerText();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  return text;
}

/** o aluno não lista cursos; o id vem da própria matrícula (título do exemplo) */
async function podeEntrarId(page: Page): Promise<string> {
  const r = await page.request.get('/api/me/enrollments');
  const j = await r.json();
  const list = (j.enrollments ?? j) as Array<{ courseId: string; course?: { slug?: string; title?: string }; courseTitle?: string }>;
  const hit = list.find((e) => e.course?.slug === PODE_ENTRAR_SLUG || /Pode entrar/.test(e.course?.title ?? e.courseTitle ?? ''));
  if (!hit) throw new Error('matrícula no "Pode entrar" não encontrada (seed do e2e)');
  return hit.courseId;
}

test.describe('navegação do aluno', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('responder, voltar, trocar a resposta e o roteiro acompanhar; mapa da aula e atalhos', async ({ page }) => {
    await login(page, 'aluna@demo.local');
    await page.goto('/aprender');
    const COURSE_ID = await podeEntrarId(page);
    const enrollmentId = await page.evaluate(async (courseId) => {
      const r = await fetch('/api/me/enrollments');
      const j = await r.json();
      const list = (j.enrollments ?? j) as Array<{ id: string; courseId: string }>;
      return list.find((e) => e.courseId === courseId)?.id ?? null;
    }, COURSE_ID);
    expect(enrollmentId).toBeTruthy();

    // tentativa nova e determinística (a aberta, se houver, fica como abandonada)
    const lessonId = 'aula_abertura_preparacao';
    const start = await page.request.post(`/api/enrollments/${enrollmentId}/lessons/${lessonId}/attempts`, { data: { forceNew: true, abandonOpen: true } });
    expect(start.ok()).toBeTruthy();

    await page.goto(`/aprender/${enrollmentId}/aulas/${lessonId}`);
    await nodeIs(page, 'v01_entrevista_comeca');
    // primeira cena: não há "Cena anterior"
    await expect(page.getByTestId('player-back')).toHaveCount(0);
    // Enter = Continuar (a ação principal desta cena)
    await page.getByTestId('player-node').locator('h2').first().focus();
    await page.keyboard.press('Enter');
    await nodeIs(page, 'q01_perfil');
    // em decisões, Enter/→ não confirmam nada
    await page.keyboard.press('ArrowRight');
    await nodeIs(page, 'q01_perfil');

    await choose(page, 'primeiro_emprego');
    await nodeIs(page, 'p01_primeiro_emprego');
    await page.getByTestId('player-continue').click();
    await nodeIs(page, 'at01_situacao_primeiro_emprego');
    await choose(page, 'colaborar');
    await nodeIs(page, 'v02_o_que_preparar');
    expect(await recapItem(page, 'meu_destaque')).toContain('Que eu colaboro bem com as pessoas.');

    // "Cena anterior": volta à atividade e deixa responder de novo
    await page.getByTestId('player-back').click();
    await nodeIs(page, 'at01_situacao_primeiro_emprego');
    await expect(page.getByTestId('player-submit')).toBeVisible();
    await shot(page, 'nav-2-cena-anterior.png');
    await choose(page, 'responsabilidade');
    await nodeIs(page, 'v02_o_que_preparar');
    expect(await recapItem(page, 'meu_destaque')).toContain('Que eu assumo responsabilidades.');

    // ← também volta
    await page.getByTestId('player-node').locator('h2').first().focus();
    await page.keyboard.press('ArrowLeft');
    await nodeIs(page, 'at01_situacao_primeiro_emprego');
    await choose(page, 'aprender');
    await nodeIs(page, 'v02_o_que_preparar');

    // mapa da aula: só cenas vistas, a atual em destaque, nenhuma futura pelo nome
    await page.getByTestId('open-lesson-map').click();
    const map = page.getByTestId('lesson-map');
    await expect(map).toBeVisible();
    await expect(map.getByTestId('lesson-map-scenes').locator('li')).toHaveCount(5);
    await expect(map.getByTestId('lesson-map-scene-v02_o_que_preparar')).toHaveAttribute('aria-current', 'step');
    await expect(map.getByText('q02_convite_amanha')).toHaveCount(0);
    await expect(map.getByTestId('lesson-map-ahead')).toBeVisible();
    await expect(map.getByText('Atalhos de teclado')).toBeVisible();
    await shot(page, 'nav-1-mapa-da-aula.png');
    // Esc fecha
    await page.keyboard.press('Escape');
    await expect(map).toBeHidden();

    // voltar pelo mapa até a pergunta de perfil e trocar o caminho
    await page.getByTestId('open-lesson-map').click();
    await page.getByTestId('lesson-map-goto-1').click();
    await expect(map).toBeHidden();
    await nodeIs(page, 'q01_perfil');
    await choose(page, 'transicao');
    await nodeIs(page, 'p03_transicao');
    await page.getByTestId('player-continue').click();
    await nodeIs(page, 'at01_ponte_transicao');
    await choose(page, 'prazos');
    await nodeIs(page, 'v02_o_que_preparar');
    expect(await recapItem(page, 'meu_destaque')).toContain('Trabalho com prazos');

    // eventos continuam só de inclusão: o histórico tem as voltas registradas
    // (verificado nos testes do banco); aqui, a página do curso mostra a cena atual
    await page.getByTestId('player-lessons-link').click();
    await expect(page).toHaveURL(new RegExp(`/aprender/${enrollmentId}$`));
    const row = page.getByTestId(`lesson-${lessonId}`);
    await expect(row).toContainText(/Em andamento · cena \d+/);
    await page.getByTestId('lesson-list').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('[data-testid="lesson-list"]')?.scrollIntoView({ block: 'start' }));
    await shot(page, 'nav-3-pagina-do-curso.png');
  });
});

test.describe('modo de teste do autor', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('"Testar a partir daqui" abre a prévia na cena; pular para cena; lista de vídeos', async ({ page }) => {
    await login(page, 'autor@demo.local');
    const COURSE_ID = await courseIdBySlug(page, PODE_ENTRAR_SLUG);

    // storyboard: "Testar a partir daqui" na S01 (aula sem variável de curso: link direto)
    await page.goto(`/estudio/cursos/${COURSE_ID}/aulas/aula_simulacao_final`);
    const s01 = page.getByTestId('scene-s01_perfil_combina');
    await expect(s01).toBeVisible();
    const testBtn = page.getByTestId('test-from-here-s01_perfil_combina');
    await testBtn.scrollIntoViewIfNeeded();
    await s01.screenshot({ path: path.join(SCREENS, 'nav-4-testar-a-partir-daqui.png') });
    await testBtn.click();
    await expect(page).toHaveURL(/\/previa\?cena=s01_perfil_combina/);
    await nodeIs(page, 's01_perfil_combina');
    await expect(page.getByTestId('test-toolbar')).toBeVisible();

    // pular para cena: lista agrupada e pesquisável
    await page.getByTestId('scene-jump').click();
    await page.getByTestId('scene-jump-search').fill('jornada');
    await expect(page.getByTestId('scene-jump-option-s04_sem_informacao_jornada')).toBeVisible();
    await expect(page.getByTestId('scene-jump-option-s01_perfil_combina')).toHaveCount(0);
    await page.getByTestId('scene-jump-search').fill('');
    await shot(page, 'nav-5-modo-de-teste.png');
    await page.getByTestId('scene-jump-search').fill('jornada');
    await page.keyboard.press('Enter');
    await nodeIs(page, 's04_sem_informacao_jornada');

    // variáveis ao vivo: pontos = 6 antes da S04 → b (+2) = 8 → faixa e01
    await page.getByTestId('test-vars-toggle').click();
    await page.getByTestId('test-var-pontos').fill('6');
    await page.getByTestId('test-var-pontos').press('Enter');
    await nodeIs(page, 's04_sem_informacao_jornada');
    await choose(page, 'b');
    await nodeIs(page, 'resultado_simulacao');
    await page.getByTestId('player-continue').click();
    await nodeIs(page, 'e01_leve_a_pratica');
    // cena anterior pela barra
    await page.getByTestId('test-back').click();
    await nodeIs(page, 'resultado_simulacao');

    // aula com variável de curso: o seletor já vem com o perfil do ramo
    await page.goto(`/estudio/cursos/${COURSE_ID}/aulas/aula_conte_sobre_voce`);
    await page.getByTestId('test-from-here-q03_experiencia').click();
    await expect(page.getByTestId('test-from-here-picker')).toBeVisible();
    await expect(page.getByTestId('test-var-perfil')).toHaveValue('experiencia');
    await page.getByTestId('test-from-here-go').click();
    await nodeIs(page, 'q03_experiencia');

    // painel do curso: lista de vídeos com "Testar" (um clique até a cena)
    await page.goto(`/estudio/cursos/${COURSE_ID}`);
    const list = page.getByTestId('course-video-list');
    await list.scrollIntoViewIfNeeded();
    await expect(list.getByTestId('video-row-s01_perfil_combina')).toContainText('sem vídeo');
    // o seed do e2e anexa um vídeo SIMULADO a esta cena
    await expect(list.getByTestId('video-row-q03_primeiro_emprego')).toContainText(/pronto|desatualizado|em geração/);
    await list.getByTestId('video-row-s01_perfil_combina').scrollIntoViewIfNeeded();
    await shot(page, 'nav-6-lista-de-videos.png');
    await list.getByTestId('video-test-s01_perfil_combina').click();
    await nodeIs(page, 's01_perfil_combina');
    await page.goBack();
    await page.getByTestId('course-video-list').getByTestId('video-test-q03_primeiro_emprego').click();
    await expect(page).toHaveURL(/v\.perfil=primeiro_emprego/);
    await nodeIs(page, 'q03_primeiro_emprego');
  });
});
