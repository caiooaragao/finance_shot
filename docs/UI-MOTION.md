# UI Motion — Finance Shot

Padrão para **troca de painéis** (ex.: gráfico ↔ detalhe/tabela) dentro do mesmo card ou região da tela.

## Quando usar

- Uma vista substitui outra no **mesmo espaço** (não é modal nem rota nova).
- O usuário pode **voltar** à vista anterior.
- A troca é disparada por clique, seleção ou botão “voltar”.

Não use para hovers, loaders (`animate-spin` / `animate-pulse`) nem transições só de cor (`transition-colors`).

## Implementação

### 1. Utilitário `runPanelSwap`

Em `app/components/panel-swap.tsx`, envolva atualizações de estado que mudam a vista:

```tsx
import { runPanelSwap } from "./panel-swap";

function chooseItem(id: string) {
  runPanelSwap(() => {
    setSelectedId(id);
  });
}
```

- Com **View Transitions API** (`document.startViewTransition` + `flushSync`): cross-fade suave da região nomeada.
- Sem suporte: entrada com keyframes CSS (`panel-swap-enter`).

### 2. Wrapper `PanelSwap`

```tsx
<PanelSwap activeKey={selected ? `detail-${selected}` : "chart"} className="flex min-h-0 flex-1 flex-col">
  {selected ? <DetailView /> : <ChartView />}
</PanelSwap>
```

- `activeKey` deve mudar a cada troca de vista (ex.: `"chart"` vs `detail-${id}`).
- Passe `className` para layout (flex, altura mínima, etc.).

### 3. Marcação da região animada

No container fixo (ex.: `<section>` do card), adicione a classe `panel-swap-vt`:

```tsx
<section className="panel-swap-vt ...">
  <PanelSwap activeKey={...}>...</PanelSwap>
</section>
```

Isso define `view-transition-name` para animar só esse bloco, não a página inteira.

## Tokens (CSS)

Definidos em `app/globals.css`:

| Token | Valor | Uso |
|-------|--------|-----|
| `--motion-panel-swap-duration` | `240ms` | Entrada / View Transition |
| `--motion-panel-swap-exit-duration` | `180ms` | Saída (View Transition) |
| `--motion-panel-swap-ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | Curva padrão |

Ajuste só com motivo claro; mantenha duração &lt; 300ms para painéis de dados.

## Acessibilidade

- `@media (prefers-reduced-motion: reduce)`: animações desligadas; a troca é instantânea.
- Não bloqueie foco: botão “voltar” deve ser o primeiro foco lógico na vista de detalhe.

## Referência no código

- `app/components/operations-board.tsx` — gráfico ↔ tabela de operações.
- `app/components/panel-swap.tsx` — componente e helper.
- `app/globals.css` — keyframes e `::view-transition-*`.

## Checklist para nova tela

1. Estado único que decide a vista (`person`, `tab`, etc.).
2. `runPanelSwap` em **todos** os caminhos que alternam a vista (seleção e voltar).
3. `panel-swap-vt` no card + `PanelSwap` com `activeKey` estável.
4. Testar com e sem View Transitions (Firefox/Safari antigos usam só keyframes de entrada).