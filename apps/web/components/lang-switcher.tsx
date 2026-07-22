"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { LOCALES, type Locale } from "@kredix/types";

const LANG_DISPLAY: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
  de: "DE",
  es: "ES",
  pt: "PT",
  it: "IT",
};

/**
 * Sélecteur de langue — reproduction exacte du HTML (.lang / .lang button).
 * Utilise les classes CSS originales définies dans globals.css.
 * Change la locale via next-intl (navigation localisée).
 */
export default function LangSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="lang">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => handleChange(l)}
          className={locale === l ? "active" : ""}
        >
          {LANG_DISPLAY[l]}
        </button>
      ))}
    </div>
  );
}
