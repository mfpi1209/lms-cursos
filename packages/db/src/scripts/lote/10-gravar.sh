#!/usr/bin/env bash
# Lote 10 (Terminei a tarefa): grava os 4 vídeos aprovados (V00, V01, V02, V03).
# Refaz o orçamento oficial e SÓ dispara se forem exatamente esses 4 e o total
# for <= US$ 3,40. Rode na raiz do repositório:
#   bash packages/db/src/scripts/lote/10-gravar.sh
set -euo pipefail
cd "$(dirname "$0")/../../../../.."
COURSE=crs_q52zsimeeahpa9bq
BASE=http://localhost:3010
MAX=3.40
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
PW=$(grep -o "SEED_PASSWORD = '[^']*'" packages/db/src/seed/seed.ts | cut -d"'" -f2)
curl -sf -c "$JAR" -H 'content-type: application/json' -H "origin: $BASE" \
  -d "{\"email\":\"autor@demo.local\",\"password\":\"$PW\"}" "$BASE/api/auth/sign-in/email" >/dev/null
Q=$(curl -sf -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" \
  -d '{"nodeIds":["v00","v01","v02","v03"]}' "$BASE/api/courses/$COURSE/media-jobs/quote")
QID=$(python3 -c '
import json,sys
d=json.loads(sys.argv[1]); mx=float(sys.argv[2])
ids=sorted(i["nodeId"] for i in d["items"]); tot=d["totals"]["estimatedUsd"]
print("orçamento:", d["quoteId"], "cenas", ids, "total US$ %.2f" % tot, "modo", d["mode"], "restante no teto US$", d["budget"]["remainingUsd"], file=sys.stderr)
assert ids==["v00","v01","v02","v03"], "cenas diferentes das aprovadas"
assert tot<=mx, "total acima do aprovado"
assert not d["budget"]["exceeded"], "teto de 24h estouraria: espere e tente de novo"
print(d["quoteId"])' "$Q" "$MAX")
echo "disparando $QID ..."
curl -s -w '\nHTTP %{http_code}\n' -b "$JAR" -H 'content-type: application/json' -H "origin: $BASE" \
  -d "{\"quoteId\":\"$QID\",\"confirmPaid\":true}" "$BASE/api/courses/$COURSE/media-jobs/batch"
