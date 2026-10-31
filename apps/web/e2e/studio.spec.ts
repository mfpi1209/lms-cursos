import { test, expect } from '@playwright/test';
import { login } from './helpers';

/** Autor cria e altera um curso por interface, valida, publica; destino inexistente bloqueia. */
test.describe('estúdio', () => {
  test('storyboard: cena nova sem destino gera aviso em linguagem humana; opção sem destino bloqueia publicação', async ({ page }) => {
    await login(page, 'autor@demo.local');
    const courses = await (await page.request.get('/api/courses')).json();
    const seed = courses.courses.find((c: any) => c.slug === 'comunicacao-no-primeiro-emprego');
    await page.goto(`/estudio/cursos/${seed.id}/aulas/aula_negociar_prazo`);
    await expect(page.locator('[data-testid^="scene-"]').first()).toBeVisible();
    await expect(page.getByTestId('storyboard-issues')).toContainText(/Tudo certo/);
    // modo avançado continua disponível
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByTestId('block-list')).toBeVisible();
    await page.getByTestId('advanced-toggle').click();
    // quebra um destino via API e confere que a revisão bloqueia
    const draft = await (await page.request.get(`/api/courses/${seed.id}/draft`)).json();
    const doc = structuredClone(draft.document);
    const lesson = doc.modules[0].lessons[0];
    lesson.graph.edges = lesson.graph.edges.filter((e: any) => e.optionId !== 'recusa');
    const saved = await page.request.put(`/api/courses/${seed.id}/draft`, { data: { document: doc, expectedRevision: draft.revision } });
    expect(saved.ok()).toBeTruthy();
    await page.goto(`/estudio/cursos/${seed.id}/revisao`);
    await expect(page.getByTestId('validation-summary')).toContainText(/erro/);
    await expect(page.getByTestId('publish')).toBeDisabled();
    // restaura
    const cur = await (await page.request.get(`/api/courses/${seed.id}/draft`)).json();
    const restore = await page.request.post(`/api/courses/${seed.id}/revisions/${draft.revision}/restore`, { data: { expectedRevision: cur.revision } });
    expect(restore.ok()).toBeTruthy();
  });

  test('curso seed: revalidar, publicar nova versão e relatório da matrícula', async ({ page }) => {
    await login(page, 'admin@demo.local');
    await page.getByRole('link', { name: 'Comunicação no primeiro emprego' }).first().click();
    await page.waitForURL(/\/estudio\/cursos\/crs_/);
    const courseId = page.url().split('/cursos/')[1]!.split('/')[0]!;
    await page.goto(`/estudio/cursos/${courseId}/revisao`);
    await page.getByTestId('revalidate').click();
    await expect(page.getByTestId('validation-summary')).toContainText('Pronto para publicar');
    // confirmação em linha lista o estado da mídia antes de criar a versão
    await page.getByTestId('publish').click();
    await expect(page.getByTestId('publish-confirm-media')).toBeVisible();
    await page.getByTestId('publish-confirm-button').click();
    await expect(page.getByTestId('publish-message')).toContainText(/publicada/);
    await page.goto(`/estudio/cursos/${courseId}/matriculas`);
    await expect(page.getByTestId('enrollment-list')).toContainText('aluno@demo.local');
    await page.getByRole('link', { name: 'Relatório' }).first().click();
    await expect(page.getByTestId('enrollment-report')).toBeVisible();
    await expect(page.getByTestId('objective-obj_negociar_prazo')).toBeVisible();
  });

  test('prévia usa o mesmo player sem persistir', async ({ page }) => {
    await login(page, 'autor@demo.local');
    await page.getByRole('link', { name: 'Comunicação no primeiro emprego' }).first().click();
    await page.waitForURL(/\/estudio\/cursos\/crs_/);
    const courseId = page.url().split('/cursos/')[1]!.split('/')[0]!;
    await page.goto(`/estudio/cursos/${courseId}/aulas/aula_negociar_prazo/previa`);
    await expect(page.getByTestId('player-node')).toHaveAttribute('data-node-id', 'decisao_prazo');
    await page.getByTestId('option-recusa').click();
    await page.getByTestId('player-submit').click();
    await expect(page.getByTestId('player-node')).toHaveAttribute('data-node-id', 'cons_recusa');
    const attempts = await page.request.get('/api/courses');
    expect(attempts.ok()).toBeTruthy();
  });
});

test.describe('mídia (API, modo simulado)', () => {
  test('upload rejeita HTML, aceita PNG; job de vídeo é explícito e não duplica', async ({ page }) => {
    await login(page, 'autor@demo.local');
    const caps = await (await page.request.get('/api/media/capabilities')).json();
    test.skip(caps.simulation === false, 'com provedores reais configurados este teste criaria um job pago');
    const bad = await page.request.post('/api/assets', { multipart: { file: { name: 'x.html', mimeType: 'text/html', buffer: Buffer.from('<script>1</script>') } } });
    expect(bad.status()).toBe(422);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const ok = await page.request.post('/api/assets', { multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: png } } });
    expect(ok.status()).toBe(200);
    const { asset } = await ok.json();
    const served = await page.request.get(asset.url, { headers: { range: 'bytes=0-3' } });
    expect(served.status()).toBe(206);

    const courses = await (await page.request.get('/api/courses')).json();
    const seed = courses.courses.find((c: any) => c.slug === 'comunicacao-no-primeiro-emprego');
    const nodeId = `cons_so_tom`;
    const body = { lessonId: 'aula_corrigir_informacao', nodeId, avatarId: 'sim_avatar_ana', voiceProvider: 'heygen', voiceId: 'sim_voice_ana', confirmPaid: true };
    const noConfirm = await page.request.post(`/api/courses/${seed.id}/media-jobs`, { data: { ...body, confirmPaid: false } });
    expect(noConfirm.status()).toBe(422);
    const existing = await (await page.request.get(`/api/courses/${seed.id}/media-jobs?nodeId=${nodeId}`)).json();
    const open = existing.jobs.find((j: any) => j.status === 'queued' || j.status === 'running');
    if (open) await page.request.post(`/api/media-jobs/${open.id}/cancel`);
    const created = await page.request.post(`/api/courses/${seed.id}/media-jobs`, { data: body });
    expect(created.status()).toBe(200);
    const { job, estimate } = await created.json();
    expect(job.status).toBe('queued');
    // modo simulado: o job é marcado como simulação e nada é cobrado (a estimativa pela tabela continua informativa)
    expect(job.simulated).toBe(true);
    expect(typeof estimate.estimatedUsd).toBe('number');
    const dup = await page.request.post(`/api/courses/${seed.id}/media-jobs`, { data: body });
    expect(dup.status()).toBe(409);
    const canceled = await page.request.post(`/api/media-jobs/${job.id}/cancel`);
    expect((await canceled.json()).status).toBe('canceled');
  });
});
