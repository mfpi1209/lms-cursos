import { test, expect } from '@playwright/test';
import { login, playThrough } from './helpers';

/**
 * Jornada do aluno com o curso seed (versão fixada na matrícula do seed).
 * Pré-requisito: `pnpm db:seed` executado contra o banco do dev server.
 */
test.describe('aluno', () => {
  test('aluno vê seus cursos e não acessa o estúdio', async ({ page }) => {
    await login(page, 'aluna@demo.local');
    await expect(page).toHaveURL(/\/aprender/);
    await page.goto('/estudio');
    await expect(page).toHaveURL(/\/aprender/);
    const res = await page.request.get('/api/courses');
    expect(res.status()).toBe(403);
  });

  test('escolhas diferentes levam a consequências diferentes; retomada após recarregar; eventId duplicado não duplica', async ({ page }) => {
    await login(page, 'aluno@demo.local');
    // o curso do seed (o aluno pode ter outras matrículas mais recentes, ex.: "Pode entrar")
    await page.getByRole('article', { name: 'Comunicação no primeiro emprego' }).getByRole('link', { name: /Continuar|Começar|Ver resultado/ }).click();
    await expect(page).toHaveURL(/\/aprender\/enr_/);
    const enrollmentId = page.url().split('/aprender/')[1]!.split('/')[0]!;

    // reinicia a aula via API se já houver tentativa concluída, para a jornada ser determinística
    const start = await page.request.post(`/api/enrollments/${enrollmentId}/lessons/aula_negociar_prazo/attempts`, { data: {} });
    expect(start.ok()).toBeTruthy();
    let { attempt } = await start.json();
    if (attempt.status === 'completed') {
      const again = await page.request.post(`/api/enrollments/${enrollmentId}/lessons/aula_negociar_prazo/attempts`, { data: { forceNew: true } });
      ({ attempt } = await again.json());
    }

    await page.goto(`/aprender/${enrollmentId}/aulas/aula_negociar_prazo`);
    const node = page.getByTestId('player-node');
    // uma tentativa deixada no meio (por exemplo por QA manual) é concluída e reiniciada
    await expect(node.or(page.getByTestId('player-completed'))).toBeVisible();
    if ((await node.getAttribute('data-node-id').catch(() => null)) !== 'decisao_prazo') {
      await playThrough(page, {});
      await page.getByTestId('player-restart').click();
    }
    await expect(node).toHaveAttribute('data-node-id', 'decisao_prazo');

    // primeira escolha -> consequência específica
    await page.getByTestId('option-negocia').click();
    await page.getByTestId('player-submit').click();
    await expect(node).toHaveAttribute('data-node-id', 'cons_negocia');
    await expect(page.getByTestId('choice-feedback')).toBeVisible();

    // retomada: recarregar mantém o ponto exato
    await page.reload();
    await expect(page.getByTestId('player-node')).toHaveAttribute('data-node-id', 'cons_negocia');

    // eventId repetido via API: mesmo resultado, revisão não avança duas vezes
    const st = await page.request.post(`/api/enrollments/${enrollmentId}/lessons/aula_negociar_prazo/attempts`, { data: {} });
    const { attempt: cur } = await st.json();
    const body = { eventId: 'e2e-dup-event-0001', nodeId: 'cons_negocia', expectedRevision: cur.revision, intent: { kind: 'advance' } };
    const r1 = await (await page.request.post(`/api/attempts/${cur.id}/events`, { data: body })).json();
    const r2 = await (await page.request.post(`/api/attempts/${cur.id}/events`, { data: body })).json();
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.revision).toBe(r1.revision);
    // revisão desatualizada (outra aba) -> 409
    const stale = await page.request.post(`/api/attempts/${cur.id}/events`, { data: { ...body, eventId: 'e2e-stale-0001' } });
    expect(stale.status()).toBe(409);

    await page.reload();
    await expect(page.getByTestId('player-node')).toHaveAttribute('data-node-id', 'conteudo_negociar');
    await playThrough(page, {
      decisao_urgencia: { option: 'aceita_tudo' },
      reflexao_prazo: { text: 'Eu avisaria cedo, mostraria o que falta e proporia uma entrega parcial com data.' },
      avaliacao_prazo: { options: ['a'] },
    }, 'avaliacao_prazo');
    // errar a avaliação uma vez permite repetir
    await page.getByTestId('option-a').click();
    await page.getByTestId('player-submit').click();
    await expect(page.getByTestId('assessment-result')).toBeVisible();
    await expect(page.getByTestId('player-node')).toHaveAttribute('data-node-id', 'avaliacao_prazo');
    await page.getByTestId('option-b').click();
    await page.getByTestId('player-submit').click();
    await expect(page.getByTestId('player-completed')).toBeVisible();
    await expect(page.getByTestId('player-progress')).toContainText('100%');
  });

  test('outro aluno não consegue agir na matrícula alheia', async ({ page }) => {
    await login(page, 'aluno@demo.local');
    const mine = await (await page.request.get('/api/me/enrollments')).json();
    const enrollmentId = mine.enrollments[0].id;
    await page.context().clearCookies();
    await login(page, 'aluna@demo.local');
    const res = await page.request.post(`/api/enrollments/${enrollmentId}/lessons/aula_negociar_prazo/attempts`, { data: {} });
    expect(res.status()).toBe(404);
  });
});
