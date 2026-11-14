# Backend no processo do Next.js

A API de trades do Senado sobe junto com o App Router. Não há servidor HTTP separado: `npm run dev`, `npm run build` e `npm run start` usam o servidor Node.js do Next.js.

O ciclo de etapas vive em `server/workflow/seed.ts`. O Postgres guarda filings, trades e o estado do scrape. O progresso das etapas fica em memória neste processo.

## Subir

```bash
docker compose up -d
npm run dev
```

`DATABASE_URL` e o proxy ficam em `.env.local` (veja `example.env`). O Postgres deste compose publica a porta **5434**, porque a 5432 costuma já estar em uso. Sem `WORKFLOW_AUTORUN=true`, nada é raspado até `POST /api/workflow/tick`.

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
