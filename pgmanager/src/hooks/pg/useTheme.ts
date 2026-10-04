"use client";

import { useCallback } from "react";

/**
 * Minimal theme toggle: `dark` class on <html>, persisted in
 * localStorage("pg-theme"). Applied before paint via the inline script
 * in layout.tsx; icons are CSS-driven (dark:hidden) so no React state
 * is needed.
 */
export function usePgTheme() {
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("pg-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  }, []);

  return { toggle };
}
