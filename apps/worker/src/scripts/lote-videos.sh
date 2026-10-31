#!/usr/bin/env bash
# Lote de 12 cursos: grava os vídeos (só as cenas V…, perguntas ficam em texto) de cada curso PRONTO.
# Aprovado pelo autor na sessão principal ("organize todas as sessões, aprovo a construção", 2026-10-30):
# até US$ 4 por curso. Seguro rodar várias vezes:
#  - pula o curso cujo instrutor ainda não está nas câmeras (nunca grava com instrutor provisório);
#  - pula o que já foi gravado ou está na fila (o orçamento só conta o que falta);
#  - pula quando o orçamento passa de US$ 4 ou o teto de 24 h estouraria (rode de novo mais tarde).
# Uso (raiz do repositório):  bash apps/worker/src/scripts/lote-videos.sh        (todos)
#                             DRY=1 bash apps/worker/src/scripts/lote-videos.sh  (só confere, não grava nada)
#                             bash apps/worker/src/scripts/lote-videos.sh 02 04  (só alguns)
set -uo pipefail
cd "$(dirname "$0")/../../../.."
BASE=http://localhost:3010
MAX=4.00
DB=postgres://localhost:5432/lms_cursos
LOG=docs/qa/lote/videos${DRY:+-teste}.log
# NN curso prefixo-das-câmeras instrutor
CURSOS="01 crs_99hpdsc8w88osiuh cam_j7_ Marina
02 crs_arbeohlw3xp5v3zx cam_camila6_ Camila
03 crs_hd4jnnpx3oj0xf14 cam_r7_ Rafael
04 crs_4z17p0m6d43qxmmo cam_thiago8_ Thiago
05 crs_4tj8a3q3g9gudgb7 cam_julia6_ Júlia
06 crs_b8zeh4b2gguseghq cam_patricia8_ Patrícia
07 crs_bmf11akamtxoti28 cam_gustavo7_ Gustavo
08 crs_8g0csi2hflfztfge cam_aline6_ Aline
09 crs_gjn468p3y6hwua4f cam_enzo8_ Enzo
10 crs_q52zsimeeahpa9bq cam_beatriz7_ Beatriz
11 crs_u4nfw88a4n2n0ubv cam_renato6_ Renato
12 crs_5vccpfypr6fmxojb cam_helena8_ Helena"

curl -sf -o /dev/null "$BASE/login" || { echo "O estúdio (porta 3010) não está no ar. Avise a sessão principal."; exit 1; }
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
PW=$(grep -o "SEED_PASSWORD = '[^']*'" packages/db/src/seed/seed.ts | cut -d"'" -f2)
curl -sf -c "$JAR" -H 'content-type: application/json' -H "origin: $BASE" \
  -d "{\"email\":\"autor@demo.local\",\"password\":\"$PW\"}" "$BASE/api/auth/sign-in/email" >/dev/null || { echo "Não consegui entrar no estúdio."; exit 1; }

gravados=(); pulados=()
while read -r NN COURSE PREFIX NOME; do
  if [ $# -gt 0 ] && [[ ! " $* " == *" $NN "* ]]; then continue; fi
  echo "" | tee -a "$LOG"; echo "=== $NN $NOME ($COURSE)  $(date +%H:%M)" | tee -a "$LOG"
  # 1) instrutor certo nas câmeras da direção e no letreiro
  CHECK=$(psql "$DB" -Atc "select document from course_drafts where course_id='$COURSE'" | python3 -c '
import json,sys
d=json.load(sys.stdin); prefix,nome=sys.argv[1],sys.argv[2]
cams={c["id"]:c for c in (d.get("presentation") or {}).get("cameras",[])}
used=set()
for m in d["modules"]:
  for l in m["lessons"]:
    for n in l["graph"]["nodes"]:
      for s in ((n.get("direction") or {}).get("shots") or []):
        if s.get("cameraId"): used.add(s["cameraId"])
bad=[c for c in used if not c.startswith(prefix)]
notready=[c for c in used if c in cams and (cams[c].get("status") or "ready")!="ready"]
who=(d.get("branding") or {}).get("presenterName","")
if not used: print("sem direção com câmeras")
elif bad: print("câmeras de outro instrutor ainda na direção: "+", ".join(sorted(bad)))
elif notready: print("câmeras ainda gerando: "+", ".join(sorted(notready)))
elif who!=nome: print("letreiro com outro nome: "+who)
else: print("ok")' "$PREFIX" "$NOME")
  if [ "$CHECK" != "ok" ]; then echo "  pulado: $CHECK" | tee -a "$LOG"; pulados+=("$NN"); continue; fi
  # 2) orçamento só das cenas V… que faltam
  Q=$(curl -sf -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" -d '{"includeStale":true}' "$BASE/api/courses/$COURSE/media-jobs/quote") || { echo "  pulado: orçamento falhou" | tee -a "$LOG"; pulados+=("$NN"); continue; }
  IDS=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(json.dumps(sorted({i["nodeId"] for i in d["items"] if i["nodeId"].lower().startswith("v") and not i.get("open")})))' "$Q")
  if [ "$IDS" = "[]" ]; then echo "  nada a gravar (já gravado ou na fila)" | tee -a "$LOG"; continue; fi
  Q=$(curl -sf -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"includeStale\":true,\"nodeIds\":$IDS}" "$BASE/api/courses/$COURSE/media-jobs/quote")
  QID=$(python3 -c '
import json,sys
d=json.loads(sys.argv[1]); mx=float(sys.argv[2])
tot=d["totals"]["estimatedUsd"]; b=d.get("budget") or {}
print("  orçamento", [i["nodeId"] for i in d["items"]], "US$ %.2f" % tot, "| modo", d["mode"], "| resta no teto US$", b.get("remainingUsd"), file=sys.stderr)
if d["mode"]!="real": print("ERRO:estúdio fora do modo real (avise a sessão principal)")
elif d.get("errors"): print("ERRO:"+"; ".join(e["message"] for e in d["errors"])[:200])
elif tot>mx: print("ERRO:acima de US$ %.2f" % mx)
elif b.get("exceeded"): print("ERRO:teto de 24 h estouraria; rode de novo mais tarde")
else: print(d["quoteId"])' "$Q" "$MAX" 2>>"$LOG")
  tail -1 "$LOG" | sed 's/^/ /'
  if [[ "$QID" == ERRO:* ]]; then echo "  pulado: ${QID#ERRO:}" | tee -a "$LOG"; pulados+=("$NN"); continue; fi
  if [ "${DRY:-}" = "1" ]; then echo "  [teste] gravaria agora (nada disparado)" | tee -a "$LOG"; gravados+=("$NN"); continue; fi
  R=$(curl -s -w ' HTTP%{http_code}' -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"quoteId\":\"$QID\",\"confirmPaid\":true}" "$BASE/api/courses/$COURSE/media-jobs/batch")
  if [[ "$R" == *HTTP200 ]]; then echo "  gravando (fila do estúdio)" | tee -a "$LOG"; gravados+=("$NN"); else echo "  pulado: ${R: -200}" | tee -a "$LOG"; pulados+=("$NN"); fi
done <<< "$CURSOS"
echo "" | tee -a "$LOG"
echo "=== RESUMO: na fila de gravação: ${gravados[*]:-nenhum} | pulados (rode de novo mais tarde): ${pulados[*]:-nenhum}" | tee -a "$LOG"
