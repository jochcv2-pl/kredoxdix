"use client";

import { useState } from "react";

// Langues supportées (rendu visuel uniquement — DEC-K1 pixel-perfect).
const LANGS = ["fr", "en", "de", "es", "pt", "it"] as const;
type Lang = (typeof LANGS)[number];

const LANG_LABELS: Record<Lang, string> = {
  fr: "FR",
  en: "EN",
  de: "DE",
  es: "ES",
  pt: "PT",
  it: "IT",
};

/**
 * Sélecteur de langue — reproduction exacte du HTML de référence (.lang).
 * Pour l'instant uniquement visuel : la logique i18n vient dans une phase ultérieure.
 */
export default function LangSwitcher() {
  const [active, setActive] = useState<Lang>("fr");

  return (
    <div className="flex gap-[3px]">
      {LANGS.map((lang) => {
        const isActive = lang === active;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setActive(lang)}
            className="font-sans text-[10px] font-semibold rounded-[20px] border px-[8px] py-[4px] transition-all duration-[150ms] cursor-pointer"
            style={
              isActive
                ? {
                    background: "var(--color-blue)",
                    color: "#fff",
                    borderColor: "var(--color-blue)",
                  }
                : {
                    background: "#fff",
                    color: "var(--color-slate)",
                    borderColor: "var(--color-line)",
                  }
            }
          >
            {LANG_LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}
