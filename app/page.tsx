import { Suspense } from "react";

import { FinanceBoard } from "./components/finance-board";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col px-6 py-16 sm:px-10">
        <Suspense fallback={<p className="text-sm text-zinc-500">Carregando dados…</p>}>
          <FinanceBoard searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
