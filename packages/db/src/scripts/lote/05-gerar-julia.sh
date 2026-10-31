#!/bin/zsh
# Rosto do instrutor (lote 12 cursos) — comando proposto pela sessão do curso, salvo pela sessão principal. PAGO (~4 créditos HeyGen).
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_4tj8a3q3g9gudgb7 INSTRUTOR="Júlia" ESTUDIO=6 PRONOUN=she
export VOICE_ID=fhtZMBwha5du5OxuvexO VOICE_OWNER=30aedf93b0a7df2ada0f523496ca9fe63f94737575ba68485eed3792db2e73af VOICE_NAME="Malu (ElevenLabs)"
export BASE_PROMPT="Photorealistic video presenter, a fictional young Brazilian woman about 26 years old, fair skin, straight dark brown hair neatly tied back in a low ponytail, natural light makeup, clear, friendly and focused expression, relaxed natural smile with mouth closed. Outfit: a button-up shirt with thin vertical navy and white stripes, sleeves slightly rolled, no logos, small stud earrings only. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
