#!/bin/zsh
# Lote 04 · PAGO (~4 créditos HeyGen): cria o Thiago (personagem só por texto) + 3 câmeras no estúdio 8
# no rascunho do curso "WhatsApp profissional sem passar vergonha". Rodar de novo só continua o que faltou.
export COURSE_ID=crs_4z17p0m6d43qxmmo INSTRUTOR=Thiago ESTUDIO=8 PRONOUN=he
export VOICE_ID=2CECaLAGTS5NRGxgbcxr VOICE_NAME="Davi Andrei (ElevenLabs)"
export VOICE_OWNER=ed7d4eb1c7a13c5467247589fd317f4ac181df7796bba465a75cca65526678bc
export BASE_PROMPT="Photorealistic video presenter, a fictional young Brazilian man about 25 years old, mixed-race (pardo), light-brown skin, short dark wavy hair with a clean fade, clean-shaven, warm and approachable expression, easy natural smile with mouth closed. Casual outfit: light blue short-sleeve button-up shirt, open collar, no logos, no accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh /Users/marcelopinheiro/Documents/lms-cursos/apps/worker/src/scripts/gerar-instrutor.sh
