#!/bin/zsh
# Lote 02 · Camila no estúdio 6, curso "Que roupa eu uso para trabalhar?". PAGO: ~4 gerações de visual
# HeyGen (1 personagem + 3 câmeras). Só passa as variáveis ao script oficial (gerar-instrutor.sh).
# Rodar de novo só continua o que faltou, sem pagar outra vez.
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
# Camila JÁ CRIADA em 2026-10-30 (rodada pelo autor; kit estudio6-camila na biblioteca). Se as 3 câmeras
# já estão prontas no kit, não faz nada (evita recriar o personagem: a câmera base saiu do rascunho com o kit).
set -a; . ./.env; set +a
PRONTAS=$(psql "$DATABASE_URL" -Atc "select count(*) from library_templates t, jsonb_array_elements(t.data->'cameraKits') k, jsonb_array_elements(k->'cameras') c where t.key='instrutor-camila' and c->>'status'='ready' and c->>'id' like 'cam_camila6_%'")
if [ "$PRONTAS" = "3" ]; then echo "[camila] já pronta: 3 câmeras no kit estudio6-camila; nada a gerar (sem custo)."; exit 0; fi
export COURSE_ID=crs_arbeohlw3xp5v3zx INSTRUTOR=Camila ESTUDIO=6 PRONOUN=she
export VOICE_ID=nczLZ6GvJGozyc3FlLte
export VOICE_OWNER=64cbc624eb5aab4e95a968e1f41d75402277cca6e549036ed17e56ea33bbbc9e
export VOICE_NAME="Juliana (ElevenLabs)"
export BASE_PROMPT="$(./apps/worker/node_modules/.bin/tsx -e "import('./packages/db/src/scripts/lote/02-roupa-biblioteca-dados.ts').then(m=>process.stdout.write(m.BASE_PROMPT))")"
[ ${#BASE_PROMPT} -gt 100 ] || { echo "BASE_PROMPT vazio"; exit 1; }
zsh apps/worker/src/scripts/gerar-instrutor.sh
