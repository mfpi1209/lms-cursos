#!/bin/zsh
# Curso 10 (lote): instrutora Beatriz no estúdio 7, voz Bea. PAGO (~4 créditos HeyGen: 1 personagem + 3 câmeras).
# Rodar de novo só continua o que faltou, sem pagar outra vez. Uso:
#   zsh packages/db/src/scripts/lote/10-gerar-beatriz.sh
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_q52zsimeeahpa9bq INSTRUTOR=Beatriz ESTUDIO=7 PRONOUN=she
export VOICE_ID=cabLxBh81HurPAAJfEHo VOICE_OWNER=8b7a43b9f8f073d90263975bacb46e8e50bc994359806f332bd2891b792eb35b VOICE_NAME="Bea (ElevenLabs)"
export BASE_PROMPT="Photorealistic video presenter, a fictional young Brazilian Indigenous woman about 28 years old, warm brown skin, long straight black hair falling past the shoulders, neatly combed, calm and welcoming expression, gentle natural smile with mouth closed. Smart-casual outfit: plain soft beige blouse, no logos, no accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
