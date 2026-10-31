#!/bin/zsh
# Rosto do instrutor (lote 12 cursos) — comando proposto pela sessão do curso, salvo pela sessão principal. PAGO (~4 créditos HeyGen).
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_bmf11akamtxoti28 INSTRUTOR="Gustavo" ESTUDIO=7 PRONOUN=he
export VOICE_ID=1DXriIY2zhyCt1cj8onn VOICE_OWNER=8b8db7fc00f354bc3e93dd010233654ac3003616fc78013901409afebf2c89ca VOICE_NAME="Cirilo (ElevenLabs)"
export BASE_PROMPT="Photorealistic video presenter, a fictional Black Brazilian man about 30 years old, deep brown skin, short black hair closely cropped, short well-groomed full beard, calm, steady and approachable expression, gentle natural smile with mouth closed. Outfit: light blue button-up dress shirt with collar open, no tie, no jacket, no logos, no accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
