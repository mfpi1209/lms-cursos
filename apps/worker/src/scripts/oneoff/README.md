# Scripts de uso único (worker)

Aplicam specs fixas de `docs/qa/**` aos rascunhos (montagem local, custo 0). Não rodam sozinhos nem entram em outro código; sem regravar nem publicar.

- `coerencia.ts`: revisão de coerência (31/10) pela spec `docs/qa/coerencia/spec.json`: situação/títulos das perguntas, cartão do fim, ponte das atividades.
- `remendos-mapa.ts`: aplica o mapa de remendos (`docs/qa/remendos/spec.json`): ajuste fino por vídeo, reações desligadas e textos de tela.
- `revisao-final.ts`: revisão final dos 14 cursos atuais (`docs/qa/revisao-final/spec.json`).
- `reaplicar-ajustes.ts`: reaplica o ajuste fino depois da regravação do roteiro (hoje feito sozinho pelo worker: `reapplyAdjustAfterRecording`).
- `localizar-retratos.ts`: privacidade do aluno. Baixa uma vez cada retrato de apresentador que ainda aponta para o provedor (`files2.heygen.ai`, link assinado que vence em dias), guarda como asset (`/api/assets/<id>`) e troca nos rascunhos dos cursos publicados e na biblioteca. Não publica. `--apply` grava; sem ele só confere. Repetir é seguro.
