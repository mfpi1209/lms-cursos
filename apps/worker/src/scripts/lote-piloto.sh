#!/bin/zsh
# Lote de 12 cursos: piloto automático. A cada ciclo (15 min):
#  1. tenta os rostos que faltam (Aline 08, Helena 12); sem crédito no HeyGen, falha sem cobrar;
#  2. registra na biblioteca e aplica o kit de quem ficou pronto (grátis, idempotente);
#  3. falhas por "Insufficient credits" não custaram nada: zera o custo delas para não comer o teto;
#  4. com a fila vazia, roda lote-videos.sh (grava o que falta ou falhou; até US$ 4 por curso; respeita o teto).
# Termina quando todos os 12 cursos estão gravados (ou após 12 h).
# Aprovado pelo autor: "Produção e entrega. APROVO, depois ajustamos." (2026-10-30).
cd /Users/marcelopinheiro/Documents/lms-cursos
set -a; . ./.env; set +a
T=./apps/worker/node_modules/.bin/tsx
L=packages/db/src/scripts/lote
DB=postgres://localhost:5432/lms_cursos
LOG=docs/qa/lote/piloto.log
log() { echo "$(date +%H:%M) $*" | tee -a $LOG; }

cams_ready() { # curso prefixo → 0 se as 3 câmeras estão prontas
  [ "$(psql $DB -Atc "select count(*) from course_drafts, jsonb_array_elements(document->'presentation'->'cameras') c where course_id='$1' and c->>'id' like '$2%' and coalesce(c->>'status','ready')='ready'")" -ge 3 ]
}

for i in $(seq 1 48); do
  log "--- ciclo $i"
  # 1+2. rostos e kits
  cams_ready crs_8g0csi2hflfztfge cam_aline6_ || zsh apps/worker/src/scripts/lote-rostos.sh 08 2>&1 | grep -E "RESUMO" | tee -a $LOG
  cams_ready crs_5vccpfypr6fmxojb cam_helena8_ || zsh apps/worker/src/scripts/lote-rostos.sh 12 2>&1 | grep -E "RESUMO" | tee -a $LOG
  if cams_ready crs_8g0csi2hflfztfge cam_aline6_; then
    $T $L/08-biblioteca-aline.ts instrutor crs_8g0csi2hflfztfge >>$LOG 2>&1
    $T $L/aplicar-kit.ts crs_8g0csi2hflfztfge estudio6-aline classica 2>&1 | tee -a $LOG
  fi
  if cams_ready crs_5vccpfypr6fmxojb cam_helena8_; then
    $T $L/12-biblioteca.ts tudo --course crs_5vccpfypr6fmxojb >>$LOG 2>&1
    $T $L/aplicar-kit.ts crs_5vccpfypr6fmxojb estudio8-helena classica 2>&1 | tee -a $LOG
  fi
  # 3. falha por falta de crédito não foi cobrada
  psql $DB -Atc "update media_jobs set cost_actual_usd=0 where status='failed' and cost_actual_usd is null and last_error ilike '%insufficient credit%'" >/dev/null
  # 4. vídeos
  open=$(psql $DB -Atc "select count(*) from media_jobs where simulated=0 and status in ('queued','running')")
  if [ "$open" = "0" ]; then
    out=$(bash apps/worker/src/scripts/lote-videos.sh 2>&1)
    echo "$out" | grep -E "RESUMO" | tee -a $LOG
    if echo "$out" | grep -q "na fila de gravação: nenhum | pulados (rode de novo mais tarde): nenhum"; then
      # 5. vídeos do lote completos: reações (A14), texto nos 4 últimos cursos (grátis) e gravação até US$ 10 por curso
      $T packages/db/src/scripts/reacoes-padrao.ts --apply --only crs_4z17p0m6d43qxmmo,crs_bmf11akamtxoti28,crs_8g0csi2hflfztfge,crs_5vccpfypr6fmxojb 2>&1 | tail -3 >>$LOG
      r=$(bash apps/worker/src/scripts/lote-reacoes.sh 2>&1 | grep "=== REAÇÕES")
      log "$r"
      if echo "$r" | grep -q "completos: 14 de 14"; then log "FEITO: lote e reações gravados"; exit 0; fi
    fi
  else
    log "fila com $open vídeos; espero"
  fi
  sleep 900
done
log "piloto encerrado após 12 h"
