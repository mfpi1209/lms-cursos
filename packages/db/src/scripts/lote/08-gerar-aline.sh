#!/bin/zsh
# Rosto do instrutor (lote 12 cursos) — comando proposto pela sessão do curso, salvo pela sessão principal. PAGO (~4 créditos HeyGen).
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_8g0csi2hflfztfge INSTRUTOR="Aline" ESTUDIO=6 PRONOUN=she
export VOICE_ID=ORgG8rwdAiMYRug8RJwR VOICE_OWNER=c6b5b17b1c22a279d69e71dd86da01e8ad40f328d3cb725b62e7c8f8c7b5e066 VOICE_NAME="Ana Alice (ElevenLabs)"
export BASE_PROMPT="Photorealistic video presenter, a fictional Brazilian woman of East Asian descent, about 29 years old, light warm skin, straight black hair in a neat chin-length bob haircut (chanel), natural light makeup, friendly and approachable expression, relaxed natural smile with mouth closed. Smart-casual outfit: soft off-white blouse with a light coral open cardigan, no logos, no accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
