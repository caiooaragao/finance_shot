"use client";

export function SystemTypewriter({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 px-4 ${className}`}>
      <section className="relative overflow-hidden rounded-[2rem] bg-panel-low px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-mint/5 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-amber/5 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-3xl space-y-4">
          <h1 className="hero-title-fade-in font-sans text-3xl font-bold tracking-[0.12em] text-ink sm:text-4xl sm:tracking-[0.14em] lg:text-[44px] lg:leading-[1.1] lg:tracking-[0.16em]">
            Open Capital Intelligence
          </h1>

          <p className="font-sans text-sm font-medium leading-snug text-mint sm:text-[15px]">
            Temos a missão de transformar dados em informações claras e úteis para a sociedade.
          </p>

          <p className="text-base leading-relaxed text-ink-dim sm:text-lg">
            Acompanhe as movimentações financeiras declaradas por membros do Congresso dos Estados Unidos. Explore
            transações reportadas ao Senado e à Câmara, descubra quais ativos estão sendo negociados, compare volumes e
            identifique padrões de investimento a partir de dados públicos oficiais.
          </p>
          

          <p className="font-sans text-sm font-semibold tracking-wide text-ink sm:text-base">
            Dados públicos. Transações do Congresso. Inteligência de mercado.
          </p>

          <p className="font-sans text-xs leading-relaxed text-line sm:text-[13px]">
            Dados baseados em divulgações públicas (PTR), sujeitos aos prazos legais de publicação. Não representam
            operações em tempo real.
          </p>
        </div>
      </section>
    </div>
  );
}