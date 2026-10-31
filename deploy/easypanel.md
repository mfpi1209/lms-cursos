# Deploy no EasyPanel

Dois serviços de aplicação (web e worker) apontando para Postgres, Redis e storage **externos** ao container (serviços gerenciados do próprio EasyPanel ou provedores).

## 1. Serviços de dados

- **PostgreSQL 17** (serviço "Postgres" do EasyPanel ou externo). Anote a `DATABASE_URL` interna (`postgres://user:senha@host:5432/db`).
- **Redis 7** (serviço "Redis"). Anote `REDIS_URL`. No incremento 1 o web não depende do Redis; o worker consome o outbox por polling no Postgres.
- Storage S3-compatível para mídia (vídeos/áudios gerados, imagens, PDFs): AWS S3, MinIO (serviço do próprio EasyPanel), Cloudflare R2 ou Backblaze B2. Configuração na seção 8.

## 2. Serviço `web` (App → Dockerfile)

- Repositório: este; Dockerfile: `Dockerfile.web`; contexto: raiz.
- Porta: `3000`. Domínio com HTTPS pelo EasyPanel.
- Health check HTTP: `GET /api/health` (retorna 200 com `{ok:true, db:'up'}`; 503 se o banco não responde).
- Variáveis obrigatórias:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET` (≥ 32 caracteres aleatórios; `openssl rand -base64 48`)
  - `BETTER_AUTH_URL` = URL pública (ex.: `https://cursos.exemplo.com.br`)
  - `NEXT_PUBLIC_APP_URL` = mesma URL pública
  - `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_PRIMARY` (opcionais)
  - `AI_PROVIDER=fake` (até a fase B)
- Réplicas: 1 (sessões ficam no banco, então pode escalar horizontalmente depois).

## 3. Serviço `worker` (App → Dockerfile)

- Dockerfile: `Dockerfile.worker`. Sem porta pública.
- Mesmas variáveis `DATABASE_URL`, `REDIS_URL`, `AI_PROVIDER`.
- Comando padrão roda o consumidor do outbox. Réplicas: 1.

## 4. Migrations e seed

Rodar antes da primeira subida e a cada deploy com migration nova (job one-off no EasyPanel ou `docker run` com a imagem do worker):

```bash
pnpm --filter @lms/db migrate
```

Seed de demonstração (idempotente; cria usuários `*@demo.local` com senha de desenvolvimento — **não rodar em produção real**):

```bash
pnpm --filter @lms/db seed
```

## 5. Backup e restauração

Backup lógico diário do Postgres (o EasyPanel tem backup agendado para o serviço Postgres; alternativamente):

```bash
pg_dump "$DATABASE_URL" --format=custom --file=lms-$(date +%F).dump
```

Restauração em banco vazio:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" lms-2026-01-01.dump
```

Conteúdo publicado, matrículas, tentativas e eventos ficam todos no Postgres; não há estado em disco nos containers. Os arquivos de mídia ficam no bucket S3 (seção 8): o banco guarda só a chave (`storage_key`) e o SHA-256, então **banco e bucket precisam ser restaurados do mesmo período**. Proteja o bucket com versionamento (recupera sobrescrita/remoção acidental) ou, no mínimo, uma regra de lifecycle que mantenha versões não-correntes por 30 dias; para desastre completo, replicação para um segundo bucket/região ou `rclone sync` agendado para outro provedor.

## 6. Checklist de segurança

- Segredos apenas nas variáveis do serviço; nunca no repositório, nos logs nem em `NEXT_PUBLIC_*`.
- `BETTER_AUTH_URL` precisa ser exatamente a URL pública (cookies seguros dependem disso).
- Imagens com tags fixas (sem `latest`).
- Após o seed em ambiente de homologação, troque as senhas dos usuários de demonstração ou remova-os.

## 7. Geração de mídia por cena (HeyGen + ElevenLabs)

Variáveis do serviço **web** e **worker**:

| Variável | Uso |
|---|---|
| `HEYGEN_API_KEY` | chave da API v3 (sem ela o sistema fica em **modo simulado**, identificado na interface) |
| `ELEVENLABS_API_KEY` | voz por ElevenLabs (opcional; sem ela só vozes nativas do HeyGen) |
| `ELEVENLABS_MODEL_ID` | padrão `eleven_multilingual_v2` |
| `HEYGEN_CALLBACK_URL` | `https://<domínio>/api/webhooks/heygen` |
| `HEYGEN_WEBHOOK_SECRET` | secret devolvido no registro do endpoint |
| `MEDIA_SIMULATION` | `1` força simulação mesmo com chaves (homologação sem custo) |
| `STORAGE_PROVIDER` / `STORAGE_DIR` | `local` grava em disco do container (só com volume persistente e 1 réplica); em produção use `s3` (seção 8) |

Registrar o webhook uma vez (job one-off no worker; o secret é impresso uma única vez):

```bash
pnpm --filter @lms/worker heygen:webhooks                      # registra HEYGEN_CALLBACK_URL
pnpm --filter @lms/worker heygen:webhooks --list               # lista endpoints (secret vem null)
pnpm --filter @lms/worker heygen:webhooks --rotate <endpointId> # novo secret; o antigo deixa de valer na hora
```

Após `--rotate`, atualize `HEYGEN_WEBHOOK_SECRET` no serviço web imediatamente. O worker também reconcilia por polling (`MEDIA_POLL_MS`, padrão 15 s), então o webhook é aceleração, não dependência. Vídeos gerados são baixados para o nosso storage; a URL temporária do HeyGen nunca é persistida.

## 8. Storage S3 para mídia

Os arquivos **nunca são servidos direto do bucket**: web e worker leem e gravam via SDK, e o navegador recebe tudo por `GET /api/assets/[id]` (sessão obrigatória, suporte a `Range` para seek de vídeo/áudio). Consequências: o bucket fica **privado** (bloqueio total de acesso público), **não precisa de CORS** nem de política pública, e o domínio do bucket não aparece para o aluno.

### 8.1 Bucket

1. Crie o bucket (ex.: `lms-midia-prod`) na mesma região do EasyPanel, com acesso público bloqueado ("Block all public access" na AWS; bucket privado no MinIO/R2/B2).
2. Ative **versionamento** (ou, no B2, "keep all versions") e uma regra de lifecycle: expirar versões não-correntes após 30 dias e abortar multipart uploads incompletos após 1 dia (o upload em streaming usa multipart; partes órfãs custam espaço).
3. Criptografia em repouso padrão do provedor (SSE-S3) é suficiente; as chaves de objeto não contêm dados pessoais (`<workspaceId>/<tipo>/<2 hex>/<sha256>.<ext>`).
4. Opcional: `S3_PREFIX=lms/prod` para compartilhar um bucket entre ambientes (cada ambiente só enxerga o próprio prefixo).

### 8.2 Credencial com privilégio mínimo

Crie um usuário/chave de acesso exclusivo da aplicação (IAM user na AWS; "service account" no MinIO; API token de bucket no R2; application key restrita ao bucket no B2) com permissão **apenas** neste bucket e prefixo. Política IAM equivalente (ajuste nome do bucket e prefixo):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ObjetosDoLms",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
      "Resource": "arn:aws:s3:::lms-midia-prod/lms/prod/*"
    },
    {
      "Sid": "BucketSomenteOQueOSdkPrecisa",
      "Effect": "Allow",
      "Action": ["s3:ListBucketMultipartUploads", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::lms-midia-prod"
    }
  ]
}
```

Sem `s3:ListBucket`, sem `s3:DeleteBucket`, sem `s3:PutBucketPolicy`, sem `*`. Não use a chave root/da conta. Rotacione a chave ao trocar de equipe e revogue a antiga.

### 8.3 Variáveis (web **e** worker, valores idênticos)

| Variável | Valor |
|---|---|
| `STORAGE_PROVIDER` | `s3` (ou vazio: com `S3_BUCKET` definido o padrão já é `s3`) |
| `S3_BUCKET` | nome do bucket |
| `S3_REGION` | região (padrão `us-east-1`; R2 usa `auto`) |
| `S3_ENDPOINT` | só para não-AWS: URL completa (`https://minio.interno:9000`, `https://<account>.r2.cloudflarestorage.com`, `https://s3.us-west-004.backblazeb2.com`) |
| `S3_FORCE_PATH_STYLE` | `1` no MinIO e na maioria dos self-hosted; vazio na AWS/R2/B2 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credencial da seção 8.2 (só nas variáveis do serviço; nunca em `NEXT_PUBLIC_*`, logs ou repositório) |
| `S3_PREFIX` | opcional, ex.: `lms/prod` |

Se `STORAGE_PROVIDER=s3` e faltar alguma variável obrigatória, web e worker falham na primeira operação de mídia com erro listando os nomes ausentes (nunca os valores).

### 8.4 Validação após o deploy

1. No Studio, gere uma cena em modo simulado (`MEDIA_SIMULATION=1`): o worker grava um `.wav` no bucket; confira o objeto em `<workspaceId>/audio/...`.
2. Abra a mídia no navegador e arraste a barra de progresso: a resposta deve ser `206 Partial Content` com `Content-Range`.
3. Remova `MEDIA_SIMULATION` quando as chaves reais estiverem configuradas.

### 8.5 Migração de `local` para `s3`

Os assets guardam `storage_provider`; um asset gravado como `local` não é servido quando o ambiente passa a `s3` (erro 500 "Storage do asset indisponível"). Para migrar: copie `STORAGE_DIR` para o bucket mantendo as chaves (`aws s3 sync .data/storage s3://lms-midia-prod/lms/prod/` ou `mc mirror`), depois `UPDATE media_assets SET storage_provider = 's3' WHERE storage_provider = 'local';` dentro de uma janela sem geração de mídia.
