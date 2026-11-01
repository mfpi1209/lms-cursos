# Decisões tomadas com autonomia (dono dormindo, 1º/11/2026)

Escolhi sempre a opção recomendada pelo revisor, sem custo extra. Qualquer uma dá para reverter.

## Piloto C24 (docs/novos-cursos/piloto-c24/proposta.md)
1. A aula 3 é **obrigatória** para quem está fazendo o curso. Quem já concluiu vê como "conteúdo novo", pela regra de não reabrir matrícula concluída.
2. O plano da missão fica **só no celular**, sem molde de 4 blocos na tela.
3. **Mantenho** os anúncios falados v01/s4 e v03/s3, porque são o único anúncio das práticas a01/a02.
4. Nas reações com abertura repetida, **corto só a 1ª frase**, se o ajuste fino aceitar o corte limpo. Se não aceitar, deixo como está, sem regravar.
5. O caso do a01 é "30 cópias para amanhã".
6. O exemplo da aula 3 é o amigo-secreto da Bia.

## Orçamento real × teto (≈04:30)
- Cotação real: 25 cursos US$ 76,84 + C01 US$ 9,34 = **US$ 86,18**, acima do teto aprovado de US$ 80,40. O preço real por segundo ficou cerca de 13% acima do usado na estimativa.
- Decisão: **gravar agora tudo, menos as reações faladas das decisões novas** (75 reações nos 25 cursos, US$ 13,29, mais as 12 do C01, ≈ US$ 2,30). Elas continuam com o retorno escrito ("Faça assim"). Também ficam prontas para gravar numa segunda leva, com aprovação extra de cerca de US$ 15,60.
- Motivo: as reações faladas eram o item opcional do orçamento. As aberturas sem a fórmula, as cenas, as explicações e as despedidas respondem diretamente às queixas do dono e foram mantidas.

## Trava diária do sistema (07:41)
- O dono pediu "Destrava". O teto do workspace (`spend_limits.mediaDailyUsd`) subiu de US$ 140 para **US$ 200**, porque 138,59 já estavam gastos nas últimas 24 h e a leva 2 precisava de cerca de 41.
- A leva 2 (C12 a C26) foi disparada na hora: US$ 39,15, acumulado da expansão **US$ 70,86** de 80,40.
- Se quiser, a trava pode voltar para 140 depois. Para isso, rode `update workspaces set spend_limits = jsonb_set(spend_limits,'{mediaDailyUsd}','140')`.
