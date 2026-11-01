# Orçamento de mídia: expansão dos 26 cursos

_1º/11/2026. Base: ritmo real de fala de 2,62 palavras/s (medido em 717 planos) e preço real de US$ 0,0183 por segundo (cotação do piloto do C01). Cada linha é contada uma vez só._

| # | Item | Como foi calculado | US$ |
|---|---|---|---|
| 1 | **Piloto C01**: aulas 3 e 4, aberturas novas, exemplos a mais e despedida | **cotação real** (25 cenas, sem o vídeo das 4 perguntas, que o player não mostra) | **9,34** |
| 2 | **Piloto C24**: uma aula nova no fim (exemplo, decisão, explicação, missão e encerramento de até 110 palavras) | estimativa: ~200 s de fala | 3,70 |
| 3 | **Os 24 cursos restantes** (C02–C26, sem o C24): só o que falta em cada curso. Encerramento de até 110 palavras; demonstração e aprofundamento só onde preenchem uma lacuna | estimativa: ~265 palavras ≈ 100 s por curso | 44,00 |
| 4 | **Aberturas sem a fórmula "No fim desta aula, tem uma missão"**: 64 planos de abertura reescritos com uma promessa própria por aula (o que já foi feito no C01). Só o plano muda; o resto do vídeo é reaproveitado | 64 × ~4,5 s | 5,30 |
| 5 | **Reserva para refazer**: falhas da HeyGen e trechos que precisarem ser regravados (aconteceu na fase anterior) | 10% de 1 a 4 | 6,20 |
| | **Total** | | **≈ 68,50** |
| 6 | _Opcional:_ reações **faladas** nas decisões novas (o pacote previa só texto). Sem elas, as decisões novas ficam com retorno escrito, enquanto as antigas têm reação em vídeo | 24 decisões × 3 reações × ~9 s | +11,90 |

**O que é grátis (não entra na conta):** os 28 cortes, as correções de texto, as remontagens, as missões "Leve para a vida real" (são texto e interface), o certificado e o raio-X.

## Saldo e limite

- O sistema registra **US$ 107,19** já gastos em mídia e um limite configurado de **US$ 140**. O saldo é de **US$ 32,81**.
- Para executar o total, o limite precisa subir para cerca de **US$ 176**. Com as reações faladas, para cerca de **US$ 188**.
- **Créditos da HeyGen:** a conta de API é recarregada à parte, e eu confiro o saldo antes de cada lote. Se faltar crédito, a recarga é feita por você.

## Regras de execução depois da aprovação

1. Antes de gravar cada curso, tiro a **cotação real**. Se ela passar a estimativa do curso em mais de 20%, eu paro e te pergunto.
2. Nunca passo do total aprovado.
3. A ordem é: pilotos C01 e C24 → você valida → os outros cursos, trilha por trilha.
4. Cada curso só é publicado depois de o robô rodar com 0 problemas bloqueantes ou importantes. O servidor volta ao modo demo depois de cada lote.
5. As estimativas das linhas 2 e 3 viram valores exatos curso a curso, e eu te mando o acumulado a cada trilha.
