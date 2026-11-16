This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## UI

- [UI Motion](docs/UI-MOTION.md) — padrão de animação para troca de painéis no mesmo espaço (ex.: gráfico ↔ tabela).

## Getting Started

`npm run dev` sobe a interface, as Server Actions e as API Routes no mesmo processo. Em produção, use `npm run build` e `npm run start`.

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A API fica em `/api` (`/api/health`, `/api/trades`, `/api/workflow`, `/api/scrape`). Os caminhos anteriores (`/health`, `/trades`, `/workflow`, `/scrape`) continuam no mesmo servidor.

**Dev local:** `./run.sh` (Postgres **5434**, app **3000**).

**Deploy local:** `./deploy.sh` — Postgres em **127.0.0.1:7001** e app em **http://localhost:7000** (Next em background; fecha o SSH sem derrubar). `./deploy.sh stop` · `./deploy.sh logs`. Tudo no Docker: `./deploy.sh docker`.

### CI/CD (GitHub Actions)

Workflow [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml): em cada PR/push na `main` rodam **test** e **build**; **lint** roda em paralelo (não bloqueia enquanto houver erros conhecidos).

**Deploy na VPS (Contabo):** crie variável `ENABLE_VPS_DEPLOY` = `true` e os secrets:

| Secret / variável | Exemplo |
|-------------------|---------|
| `ENABLE_VPS_DEPLOY` | `true` (variável do repositório) |
| `DEPLOY_HOST` | IP da VPS |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | chave privada OpenSSH (sem senha) |
| `DEPLOY_PATH` | opcional: `/opt/caio_projetos/finance_shot` |

Na VPS: coloque a **chave pública** em `~/.ssh/authorized_keys`. O job faz `git reset --hard origin/main` e `bash deploy.sh`, depois `GET /api/health` na porta 7000.

Gerar par de chaves (máquina local): `ssh-keygen -t ed25519 -f finance_shot_deploy -N ""` → secret = conteúdo de `finance_shot_deploy`, servidor = `finance_shot_deploy.pub`.

Deploy manual: **Actions → CI/CD → Run workflow**.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
