#!/usr/bin/env bash
# Reações da instrutora a cada resposta (A14): grava só as cenas de reação ("q01~a"…) que faltam, curso a curso.
# Aprovado pelo autor na sessão principal: "Eu aprovo se ficar nessa faixa até usd 10" / "10usd por curso" (2026-10-30).
#  - pula o curso cujo orçamento de reações passa de US$ 10 (ou de $MAX);
#  - pula quando o teto de 24 h estouraria (rode de novo mais tarde: o piloto faz isso);
#  - pula o que já foi gravado ou está na fila.
# Uso (raiz):  bash apps/worker/src/scripts/lote-reacoes.sh   |   DRY=1 … (só confere)
set -uo pipefail
cd "$(dirname "$0")/../../../.."
BASE=http://localhost:3010
MAX=${MAX:-10.00}
LOG=docs/qa/lote/reacoes${DRY:+-teste}.log
# menores primeiro; Primeira Vaga por último
CURSOS="crs_99hpdsc8w88osiuh 01-Primeiro-dia
crs_arbeohlw3xp5v3zx 02-Roupa
crs_hd4jnnpx3oj0xf14 03-Celular
crs_4z17p0m6d43qxmmo 04-WhatsApp
crs_4tj8a3q3g9gudgb7 05-Horarios
crs_b8zeh4b2gguseghq 06-Limites
crs_bmf11akamtxoti28 07-Equipe
crs_8g0csi2hflfztfge 08-Espacos
crs_gjn468p3y6hwua4f 09-Redes
crs_q52zsimeeahpa9bq 10-Tarefa
crs_u4nfw88a4n2n0ubv 11-Regras
crs_5vccpfypr6fmxojb 12-Postura
crs_gujuaiykqcsl2n31 Comece-bem
crs_hvvgkvtd1rb2um0l Primeira-Vaga"

curl -sf -o /dev/null "$BASE/login" || { echo "estúdio fora do ar"; exit 1; }
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
PW=$(grep -o "SEED_PASSWORD = '[^']*'" packages/db/src/seed/seed.ts | cut -d"'" -f2)
curl -sf -c "$JAR" -H 'content-type: application/json' -H "origin: $BASE" \
  -d "{\"email\":\"autor@demo.local\",\"password\":\"$PW\"}" "$BASE/api/auth/sign-in/email" >/dev/null || { echo "login falhou"; exit 1; }

gravados=(); pulados=(); prontos=()
while read -r COURSE NOME; do
  Q=$(curl -sf -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" -d '{"includeStale":true}' "$BASE/api/courses/$COURSE/media-jobs/quote") || { echo "$(date +%H:%M) $NOME: orçamento falhou" | tee -a "$LOG"; pulados+=("$NOME"); continue; }
  IDS=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(json.dumps(sorted({i["nodeId"] for i in d["items"] if "~" in i["nodeId"] and not i.get("open")})))' "$Q")
  if [ "$IDS" = "[]" ]; then prontos+=("$NOME"); continue; fi
  Q=$(curl -sf -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"includeStale\":true,\"nodeIds\":$IDS}" "$BASE/api/courses/$COURSE/media-jobs/quote")
  QID=$(python3 -c '
import json,sys
d=json.loads(sys.argv[1]); mx=float(sys.argv[2]); tot=d["totals"]["estimatedUsd"]; b=d.get("budget") or {}
print("%s reações US$ %.2f | resta no teto US$ %s" % (len(d["items"]), tot, b.get("remainingUsd")), file=sys.stderr)
if d["mode"]!="real": print("ERRO:estúdio fora do modo real")
elif d.get("errors"): print("ERRO:"+"; ".join(e["message"] for e in d["errors"])[:200])
elif tot>mx: print("ERRO:acima de US$ %.2f (precisa de aprovação do autor)" % mx)
elif b.get("exceeded"): print("ERRO:teto de 24 h; fica para o próximo ciclo")
else: print(d["quoteId"])' "$Q" "$MAX" 2>/tmp/lote-reacoes-$$.txt)
  echo "$(date +%H:%M) $NOME: $(cat /tmp/lote-reacoes-$$.txt)" | tee -a "$LOG"; rm -f /tmp/lote-reacoes-$$.txt
  if [[ "$QID" == ERRO:* ]]; then echo "  pulado: ${QID#ERRO:}" | tee -a "$LOG"; pulados+=("$NOME"); continue; fi
  if [ "${DRY:-}" = "1" ]; then echo "  [teste] gravaria" | tee -a "$LOG"; gravados+=("$NOME"); continue; fi
  R=$(curl -s -w ' HTTP%{http_code}' -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"quoteId\":\"$QID\",\"confirmPaid\":true}" "$BASE/api/courses/$COURSE/media-jobs/batch")
  if [[ "$R" == *HTTP200 ]]; then echo "  gravando" | tee -a "$LOG"; gravados+=("$NOME"); else echo "  pulado: ${R: -200}" | tee -a "$LOG"; pulados+=("$NOME"); fi
done <<< "$CURSOS"
echo "$(date +%H:%M) === REAÇÕES: gravando: ${gravados[*]:-nenhum} | pulados: ${pulados[*]:-nenhum} | completos: ${#prontos[@]} de 14" | tee -a "$LOG"
