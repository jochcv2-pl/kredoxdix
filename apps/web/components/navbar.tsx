"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LangSwitcher from "@/components/lang-switcher";

/**
 * Navbar — reproduction EXACTE du HTML de référence (.nav / .nav-menu / .burger).
 * Composant client pour gérer l'état du menu burger mobile (DEC-K1 : classes identiques).
 * Le burger bascule la classe `.open` sur `.nav-menu`, comme le HTML original
 * (onclick="...classList.toggle('open')").
 */
export default function Navbar({ siteName = "Kredix", logoUrl }: { siteName?: string; logoUrl?: string }) {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);

  // Ferme le menu mobile lors d'un redimensionnement vers desktop.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 860) setOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Verrouille le scroll du body quand le menu mobile est ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} style={{ maxHeight: 36 }} />
          ) : (
            siteName
          )}
        </Link>
        <nav className={`nav-menu${open ? " open" : ""}`} id="navMenu">
          <a href="#services" onClick={() => setOpen(false)}>
            {t("services")}
          </a>
          <a href="#comment" onClick={() => setOpen(false)}>
            {t("howItWorks")}
          </a>
          <a href="#contact" onClick={() => setOpen(false)}>
            {t("contact")}
          </a>
          <Link href="/suivi" onClick={() => setOpen(false)}>
            {t("suivi")}
          </Link>
        </nav>
        <div className="nav-right">
          <LangSwitcher />
          <a href="#simulateur" className="nav-cta" onClick={() => setOpen(false)}>
            {t("cta")}
          </a>
          <button
            className={`burger${open ? " active" : ""}`}
            aria-label="Ouvrir le menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </header>
  );
}
