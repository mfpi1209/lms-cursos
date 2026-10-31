#!/bin/zsh
# Gera as câmeras da Marina (esquerda, direita, 3/4) nos estúdios jovens aprovados para teste.
# PAGO: 1 geração de visual (look) HeyGen por câmera. Uso:
#   zsh apps/worker/src/scripts/gerar-estudios.sh            # os 3 estúdios (9 câmeras)
#   zsh apps/worker/src/scripts/gerar-estudios.sh 7          # só um estúdio (3 câmeras)
#   zsh apps/worker/src/scripts/gerar-estudios.sh 6 7 8 esq  # só a câmera "esquerda" de cada estúdio (comparação)
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
set -a; . ./.env; set +a
unset MEDIA_SIMULATION
export ALLOW_PAID_PROVIDERS=1
TSX=./apps/worker/node_modules/.bin/tsx
LOOK=apps/worker/src/scripts/scene-look.ts

typeset -A DESC
DESC[6]="studio: clean wall, navy pegboard and orange arch left, navy shelf with DW logo right"
DESC[7]="studio: clean wall, wooden arch with LED left, orange curved wall with DW logo right"
DESC[8]="studio: clean wall, navy panels with wood slats and LED both sides, DW logo right"

ONLY=""
STUDIOS=()
for a in "$@"; do
  case "$a" in
    esq|dir|34) ONLY="$a" ;;
    *) STUDIOS+=("$a") ;;
  esac
done
[ ${#STUDIOS[@]} -eq 0 ] && STUDIOS=(6 7 8)

for n in $STUDIOS; do
  R=docs/brand/cenario/estudio-jovem-$n.png
  S="${DESC[$n]}"
  echo "== Estúdio $n"
  if [ -z "$ONLY" ] || [ "$ONLY" = esq ]; then $TSX $LOOK front "cam_j${n}_esq" "Estúdio $n · Marina à esquerda" left_third "$R" "$S"; fi
  if [ -z "$ONLY" ] || [ "$ONLY" = dir ]; then $TSX $LOOK front "cam_j${n}_dir" "Estúdio $n · Marina à direita" right_third "$R" "$S"; fi
  if [ -z "$ONLY" ] || [ "$ONLY" = 34 ];  then $TSX $LOOK three_quarter "cam_j${n}_34" "Estúdio $n · 3/4" center "$R" "$S"; fi
done
echo "== Pronto. Peça ao Claude para montar a comparação."
