This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

`npm run dev` sobe a interface, as Server Actions e as API Routes no mesmo processo. Em produção, use `npm run build` e `npm run start`.

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A API fica em `/api` (`/api/health`, `/api/trades`, `/api/workflow`, `/api/scrape`). Os caminhos anteriores (`/health`, `/trades`, `/workflow`, `/scrape`) continuam no mesmo servidor.

**Dev local:** `./run.sh` (Postgres **5434**, app **3000**).

**Deploy local:** `./deploy.sh` — Postgres em **127.0.0.1:7000** e app em **http://localhost:7000**. Se a porta 7000 conflitar, use `./deploy.sh docker`.

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
