#!/bin/zsh
# Lote de 12 cursos: cria os rostos dos 10 instrutores novos, UM POR VEZ (PAGO: ~4 créditos HeyGen cada).
# Aprovado pelo autor na sessão principal ("aprovo a construção", 2026-10-30).
# Rodar de novo é seguro: cada instrutor só continua o que faltou, sem pagar outra vez.
# Uso:  zsh apps/worker/src/scripts/lote-rostos.sh            (todos)
#       zsh apps/worker/src/scripts/lote-rostos.sh 05 11      (só alguns)
cd /Users/marcelopinheiro/Documents/lms-cursos
setopt pipefail
L=packages/db/src/scripts/lote
LOG=docs/qa/lote/rostos.log
ALL=(02-gerar-camila 04-gerar-thiago 05-gerar-julia 06-gerar-patricia 07-gerar-gustavo 08-gerar-aline 09-gerar-enzo 10-gerar-beatriz 11-gerar-renato 12-gerar-helena)
SEL=()
if [ $# -eq 0 ]; then SEL=($ALL); else for n in "$@"; do for a in $ALL; do [[ $a == $n-* ]] && SEL+=($a); done; done; fi
ok=(); falhou=()
for s in $SEL; do
  echo "\n=== $s  ($(date +%H:%M))" | tee -a $LOG
  if zsh $L/$s.sh 2>&1 | tee -a $LOG; then ok+=($s); else falhou+=($s); fi
done
echo "\n=== RESUMO: prontos: ${ok[*]:-nenhum} | com erro (rode de novo só esses): ${falhou[*]:-nenhum}" | tee -a $LOG
