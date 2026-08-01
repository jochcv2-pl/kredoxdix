import { defineRouting } from "next-intl/routing";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@kredix/types";

export const routing = defineRouting({
  locales: LOCALES as readonly string[],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeDetection: false,
});

export type { Locale };
