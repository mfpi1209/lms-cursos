#!/bin/zsh
# Rosto do instrutor (lote 12 cursos) — comando proposto pela sessão do curso, salvo pela sessão principal. PAGO (~4 créditos HeyGen).
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_b8zeh4b2gguseghq INSTRUTOR="Patrícia" ESTUDIO=8 PRONOUN=she
export VOICE_ID=fUAUU80st9SqdYx319Zk VOICE_OWNER=60810c04271cce7062b143985b41f1c6840190b31e003216712feaa4bd3c3bff VOICE_NAME="Luciana Cadar (ElevenLabs)"
export BASE_PROMPT="Photorealistic video presenter, a fictional Brazilian woman about 38 years old, warm medium-brown skin, short natural dark hair in a neat pixie cut, small stud earrings, serene and kind expression, calm gentle smile with mouth closed. Smart-casual outfit: plain soft terracotta blouse with a simple round neckline, no logos, no other accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
