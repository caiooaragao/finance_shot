# Backend no processo do Next.js

A API de trades do Senado sobe junto com o App Router. Não há servidor HTTP separado: `npm run dev`, `npm run build` e `npm run start` usam o servidor Node.js do Next.js.

O ciclo de etapas vive em `server/workflow/seed.ts`. O Postgres guarda filings, trades e o estado do scrape. O progresso das etapas fica em memória neste processo.

## Subir

```bash
docker compose up -d
npm run dev
```

`DATABASE_URL` e o proxy ficam em `.env.local` (veja `example.env`). Em dev (`./run.sh`), o Postgres publica a porta **5434**. Em deploy (`./deploy.sh`), banco e app usam a porta **7000** (`POSTGRES_PORTS=127.0.0.1:7000:5432`, `APP_PORT=7000`). Sem `WORKFLOW_AUTORUN=true`, nada é raspado até `POST /api/workflow/tick`.

Para copiar os dados do Postgres local para um Postgres na nuvem, use `sync-to-cloud.sh` na raiz de `finance_shot` (Git Bash ou WSL). Na primeira vez em banco vazio, passe `--apply-schema`. Use a connection string **direta** do provedor (ex.: Supabase porta 5432, não o pooler 6543).

```bash
CLOUD_DATABASE_URL='postgresql://…' ./sync-to-cloud.sh --apply-schema -y
```

Se o eFD responder 403, a etapa `senate-client` fica `blocked` e o backfill não começa. Preencha `OUTBOUND_PROXY_URL` com um proxy residencial nos EUA, reinicie o Next.js e chame `PUT /api/workflow/steps/senate-client` ou `POST /api/workflow/retry` com `{ "stepId": "senate-client" }`.

Cada tick executa uma etapa. A ordem semeada é `schema`, `senate-client`, `parse-normalize`, `serve-api`, `backfill-3y`, `incremental-6h`. O backfill pede os PTRs eletrônicos de todos os anos do eFD (desde 2012), ano a ano. Depois disso, o processo repete a busca a cada 6 horas e só insere o que ainda não está em `senate_filings`.

## Rotas

Os endpoints canônicos ficam em `app/api/`. Os caminhos antigos (`/health`, `/trades`, `/workflow`, `/scrape`) continuam válidos por rewrite.

- `GET /api/health`
- `GET /api/trades/recent`
- `GET /api/trades/:ticker`
- `GET /api/trades`
- `GET /api/workflow`
- `GET /api/workflow/steps/:stepId`
- `POST /api/workflow/tick`
- `POST /api/workflow/retry` ou `PUT /api/workflow/retry` com `{ "stepId": "senate-client" }`
- `PUT /api/workflow/steps/:stepId` reabre uma etapa `blocked` ou `failed`
- `DELETE /api/workflow/steps/:stepId` cancela uma etapa que não está `running` nem `completed`
- `POST /api/scrape`

A resposta de `/api/trades` segue o envelope da CongressInvests. Operações internas da interface usam Server Actions em `app/actions/`.
