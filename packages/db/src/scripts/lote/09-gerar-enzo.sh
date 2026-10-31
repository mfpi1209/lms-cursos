#!/bin/zsh
# Lote 09 (Redes sociais): cria o instrutor Enzo no estúdio 8. PAGO: ~4 gerações de visual HeyGen
# (1 personagem + 3 câmeras). A voz Matheus (biblioteca ElevenLabs) é adicionada à conta (grátis).
# Rodar de novo só continua o que faltou, sem pagar outra vez. Uso (no Terminal):
#   zsh packages/db/src/scripts/lote/09-gerar-enzo.sh
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_gjn468p3y6hwua4f INSTRUTOR=Enzo ESTUDIO=8 PRONOUN=he
export VOICE_ID=NQmLEqxcRTkWYIYZSYod VOICE_NAME="Matheus (ElevenLabs)"
export VOICE_OWNER=64cbc624eb5aab4e95a968e1f41d75402277cca6e549036ed17e56ea33bbbc9e
export BASE_PROMPT="Photorealistic video presenter, a fictional young Brazilian man about 24 years old, fair skin, medium-length wavy dark brown hair, clean-shaven, upbeat and friendly expression, relaxed natural smile with mouth closed. Casual outfit: plain white crew-neck t-shirt under a light open olive-green jacket, no logos, no accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
