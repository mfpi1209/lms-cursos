#!/bin/zsh
# Lote 12 · PAGO (~4 créditos HeyGen): cria a Helena (personagem por texto) + 3 câmeras no estúdio 8
# no rascunho do curso "Como receber uma correção de postura". Rodar de novo só continua o que faltou.
export COURSE_ID=crs_5vccpfypr6fmxojb INSTRUTOR=Helena ESTUDIO=8 PRONOUN=she
export VOICE_ID=lxZ1N0qzmAGjqcuEctoH VOICE_NAME="Ádria Freitas (ElevenLabs)"
export VOICE_OWNER=10b0f198da7ab8bd207b7eae61da9af2993ba71e7c32dffeaf85ca2bbc8268ac
export BASE_PROMPT="Photorealistic video presenter, a fictional Black Brazilian woman about 45 years old, deep brown skin, short natural gray hair (salt-and-pepper, close-cropped afro), warm, calm and welcoming expression, gentle natural smile with mouth closed. Smart-casual outfit: plain soft terracotta knit blouse under an open light beige linen blazer, small simple stud earrings, no logos. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people."
zsh /Users/marcelopinheiro/Documents/lms-cursos/apps/worker/src/scripts/gerar-instrutor.sh
