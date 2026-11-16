# Backend no processo do Next.js

A API de trades do Senado sobe junto com o App Router. Não há servidor HTTP separado: `npm run dev`, `npm run build` e `npm run start` usam o servidor Node.js do Next.js.

O ciclo de etapas vive em `server/workflow/seed.ts`. O Postgres guarda filings, trades e o estado do scrape. O progresso das etapas fica em memória neste processo.

## Subir

```bash
docker compose up -d
npm run dev
```

`DATABASE_URL` e o proxy ficam em `.env.local` (veja `example.env`). Em dev (`./run.sh`), o Postgres publica a porta **5434**. Em deploy (`./deploy.sh`), Postgres no host **7001** e app na **7000** (`POSTGRES_PORTS=127.0.0.1:7001:5432`, `APP_PORT=7000`). O scrape **não** é disparado por rota HTTP (`/api/scrape` e `/api/workflow/tick` não existem).

**Atualizar dados:** com `WORKFLOW_AUTORUN=true`, o app avança o workflow na subida e, após a etapa `incremental-6h`, agenda refresh a cada 6 h no processo. Na VPS, cron no host (exemplo a cada 6 h):

```bash
0 */6 * * * cd /opt/caio_projetos/finance_shot && set -a && source .env.local && set +a && npm run scrape:incremental >> .deploy/scrape-cron.log 2>&1
```

Backfill inicial: `npm run scrape` (ou `WORKFLOW_AUTORUN=true` até concluir o backfill).

Para copiar os dados do Postgres local para um Postgres na nuvem, use `sync-to-cloud.sh` na raiz de `finance_shot` (Git Bash ou WSL). Na primeira vez em banco vazio, passe `--apply-schema`. Use a connection string **direta** do provedor (ex.: Supabase porta 5432, não o pooler 6543).

```bash
CLOUD_DATABASE_URL='postgresql://…' ./sync-to-cloud.sh --apply-schema -y
```

Se o eFD responder 403, a etapa `senate-client` fica `blocked` e o backfill não começa. Preencha `OUTBOUND_PROXY_URL` com um proxy residencial nos EUA, reinicie o Next.js e chame `PUT /api/workflow/steps/senate-client` ou `POST /api/workflow/retry` com `{ "stepId": "senate-client" }`.

Cada tick executa uma etapa. A ordem semeada é `schema`, `senate-client`, `parse-normalize`, `serve-api`, `backfill-3y`, `incremental-6h`. O backfill pede os PTRs eletrônicos de todos os anos do eFD (desde 2012), ano a ano. Depois disso, o processo repete a busca a cada 6 horas e só insere o que ainda não está em `senate_filings`.

## Rotas

Os endpoints canônicos ficam em `app/api/`. Os caminhos antigos (`/health`, `/trades`, `/workflow`) continuam válidos por rewrite.

- `GET /api/health`
- `GET /api/trades/recent`
- `GET /api/trades/:ticker`
- `GET /api/trades`
- `POST /api/members` com `{}` — nomes distintos de quem operou na House e no Senate
- `POST /api/members/search` com `{ "q": "Pelosi" }` — filtra esses nomes por trecho (`name` também vale)
- `POST /api/members/trades` com `{ "name": "Abigail Spanberger" }` — trades do nome selecionado, no mesmo envelope de `/api/trades` (`limit` e `offset` vão no JSON)
- `GET /api/workflow`
- `GET /api/workflow/steps/:stepId`
- `POST /api/workflow/retry` ou `PUT /api/workflow/retry` com `{ "stepId": "senate-client" }`
- `PUT /api/workflow/steps/:stepId` reabre uma etapa `blocked` ou `failed`
- `DELETE /api/workflow/steps/:stepId` cancela uma etapa que não está `running` nem `completed`

A resposta de `/api/trades` segue o envelope da CongressInvests. Operações internas da interface usam Server Actions em `app/actions/`.
