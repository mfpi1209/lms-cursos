#!/bin/zsh
# Rosto do instrutor (lote 12 cursos) — comando proposto pela sessão do curso, salvo pela sessão principal. PAGO (~4 créditos HeyGen).
set -e
cd /Users/marcelopinheiro/Documents/lms-cursos
export COURSE_ID=crs_u4nfw88a4n2n0ubv INSTRUTOR="Renato" ESTUDIO=6 PRONOUN=he
export VOICE_ID=AaeZyyi87RCxtFnHPS3e VOICE_OWNER=481e049fb3789f6e1f9916099ea6d880e1edf7a872923f89cac04ba1142be06a VOICE_NAME="Campanholi (ElevenLabs)"
export BASE_PROMPT="Photorealistic video presenter, a fictional Brazilian man about 34 years old, warm light-brown (pardo) skin, short dark wavy hair neatly combed, clean-shaven, thin dark rectangular glasses, calm and patient expression, gentle natural smile with mouth closed. Smart-casual outfit: soft gray knit cardigan over a plain white crew-neck t-shirt, no logos, no other accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, glasses without glare, large enough for lip-sync. No text, no logos, no other people."
zsh apps/worker/src/scripts/gerar-instrutor.sh
