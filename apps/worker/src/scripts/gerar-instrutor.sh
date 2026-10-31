#!/bin/zsh
# Instrutor novo para um curso. PAGO: ~4 gerações de visual HeyGen (1 personagem + 3 câmeras).
# Voz da biblioteca ElevenLabs adicionada à conta (grátis). Rodar de novo só continua o que faltou,
# sem pagar outra vez. COURSE_ID e INSTRUTOR são obrigatórios (sem padrão, para não mexer no curso errado). Uso:
#   COURSE_ID=crs_… INSTRUTOR=Helena ESTUDIO=8 PRONOUN=she VOICE_ID=… VOICE_OWNER=… VOICE_NAME="…" \
#   BASE_PROMPT="Photorealistic video presenter, a fictional …" zsh apps/worker/src/scripts/gerar-instrutor.sh
#   (ESTUDIO_DESC opcional: o padrão é a descrição do estúdio 6/7/8; CAM_PREFIX opcional: o nome sem acento)
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
set -a; . ./.env; set +a
unset MEDIA_SIMULATION
export ALLOW_PAID_PROVIDERS=1
if [ -z "$COURSE_ID" ] || [ -z "$INSTRUTOR" ]; then echo "Faltou COURSE_ID e/ou INSTRUTOR (ex.: COURSE_ID=crs_… INSTRUTOR=Helena)"; exit 1; fi
export COURSE_ID INSTRUTOR ESTUDIO=${ESTUDIO:-7} PRONOUN=${PRONOUN:-he}
./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/novo-instrutor.ts
