# Backend Node

Processo separado do App Router. Sobe a API de trades do Senado e o ciclo de etapas no Postgres.

## Subir

```bash
docker compose up -d
npm run backend
```

`DATABASE_URL` e o proxy ficam em `.env.local` (veja `example.env`). O Postgres deste compose publica a porta **5434**, porque a 5432 costuma já estar em uso. Sem `WORKFLOW_AUTORUN=true`, nada é raspado até `POST /workflow/tick`.

Se o eFD responder 403, a etapa `senate-client` fica `blocked` e o backfill não começa. Preencha `OUTBOUND_PROXY_URL` com um proxy residencial nos EUA, reinicie o processo e chame `POST /workflow/retry` com `{ "stepId": "senate-client" }`.

Cada tick executa uma etapa. A ordem semeada é `schema`, `senate-client`, `parse-normalize`, `serve-api`, `backfill-3y`, `incremental-6h`. O backfill pede os PTRs dos últimos 3 anos. Depois disso, o processo repete a busca a cada 6 horas e só insere o que ainda não está em `senate_filings`.

## Rotas

- `GET /health`
- `GET /trades/recent`
- `GET /trades/:ticker`
- `GET /trades`
- `GET /workflow`
- `POST /workflow/tick`
- `POST /workflow/retry` com `{ "stepId": "senate-client" }`
- `POST /scrape`

A resposta de `/trades` segue o envelope da CongressInvests. O estado das etapas, o feedback e as revisões do plano ficam nas tabelas `workflow_steps`, `workflow_feedback` e `workflow_plan_revisions`.
