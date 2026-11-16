"use client";

import { flushSync } from "react-dom";
import type { ReactNode } from "react";

export function runPanelSwap(update: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    document.startViewTransition(() => {
      flushSync(update);
    });
  } else {
    update();
  }
}

type PanelSwapProps = {
  activeKey: string;
  children: ReactNode;
  className?: string;
};

/** Troca de painel no mesmo espaço; ver docs/UI-MOTION.md */
export function PanelSwap({ activeKey, children, className }: PanelSwapProps) {
  const root = ["panel-swap", className].filter(Boolean).join(" ");
  return (
    <div className={root}>
      <div key={activeKey} className="panel-swap__surface">
        {children}
      </div>
    </div>
  );
}