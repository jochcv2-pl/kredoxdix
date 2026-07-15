import type { Metadata } from "next";
import LangSwitcher from "@/components/lang-switcher";
import SimulatorAndForm from "@/components/simulator-and-form";

export const metadata: Metadata = {
  title: "Kredix - Courtier en financement",
  description:
    "Kredix compare 40 banques pour vous obtenir le meilleur taux. Simulez gratuitement votre crédit et recevez une réponse en 24 heures.",
};

/**
 * Landing page Kredix — reproduction fidèle du HTML de référence (DEC-K1).
 *
 * Server Component par défaut. Les parties interactives (simulateur, formulaire,
 * sélecteur de langue) sont des composants client importés.
 */
export default function HomePage() {
  return (
    <>
      {/* ===== NAV ===== */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottomColor: "var(--color-line-soft)",
        }}
      >
        <div
          className="flex items-center justify-between gap-4 mx-auto"
          style={{ maxWidth: "1120px", padding: "14px 24px" }}
        >
          <a href="#top" className="text-[23px] font-extrabold text-blue tracking-[-0.02em]">
            Kredix
          </a>

          <nav className="flex items-center gap-7 nav-menu">
            <a
              href="#services"
              className="text-[13px] font-semibold text-slate transition-colors duration-150 hover:text-blue"
            >
              Nos services
            </a>
            <a
              href="#comment"
              className="text-[13px] font-semibold text-slate transition-colors duration-150 hover:text-blue"
            >
              Comment ça marche
            </a>
            <a
              href="#contact"
              className="text-[13px] font-semibold text-slate transition-colors duration-150 hover:text-blue"
            >
              Nous contacter
            </a>
          </nav>

          <div className="flex items-center gap-[14px]">
            <LangSwitcher />
            <a
              href="#simulateur"
              className="text-[12px] font-bold text-white bg-orange rounded-pill whitespace-nowrap"
              style={{ padding: "9px 16px", letterSpacing: "0.01em" }}
            >
              Simuler mon crédit
            </a>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section
        id="top"
        className="hero relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--color-blue) 0%, var(--color-blue-dark) 55%, var(--color-blue-deep) 100%)",
          padding: "72px 0 76px",
        }}
      >
        {/* Blobs décoratifs */}
        <div
          aria-hidden
          className="absolute rounded-[50%]"
          style={{
            top: "-100px",
            right: "-80px",
            width: "380px",
            height: "380px",
            background:
              "radial-gradient(circle, rgba(249,115,22,0.22), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-[50%]"
          style={{
            bottom: "-120px",
            left: "-100px",
            width: "420px",
            height: "420px",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.09), transparent 70%)",
          }}
        />
        {/* Grid background */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
          }}
        />

        <div className="wrap relative z-[2]">
          <div className="max-w-[760px] mx-auto text-center">
            <span
              className="inline-block rounded-[30px] mb-6 text-[11px] font-semibold text-white"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
                padding: "6px 16px",
                letterSpacing: "0.03em",
              }}
            >
              Noté 4,9/5 par plus de 350 clients
            </span>

            <h1 className="text-[44px] font-black text-white leading-[1.08] tracking-[-0.03em] mb-5">
              Obtenez le{" "}
              <span className="relative whitespace-nowrap text-[#FFDDBC]">
                <span
                  aria-hidden
                  className="absolute bg-orange rounded-[4px] -z-10"
                  style={{
                    left: "-2px",
                    right: "-2px",
                    bottom: "3px",
                    height: "9px",
                    opacity: 0.5,
                  }}
                />
                meilleur taux
              </span>{" "}
              pour votre crédit.
            </h1>

            <p className="text-[16px] text-white/85 leading-[1.7] max-w-[540px] mx-auto mb-[34px] font-normal">
              Kredix compare 40 banques et négocie l&apos;offre la plus
              avantageuse pour votre profil. Simulez gratuitement, sans
              engagement, et recevez une réponse en 24 heures.
            </p>

            <div className="flex gap-3 justify-center flex-wrap mb-10">
              <a
                href="#simulateur"
                className="inline-flex items-center justify-center gap-2 bg-orange text-white rounded-md font-bold transition-transform duration-[120ms] hover:-translate-y-0.5"
                style={{
                  padding: "15px 30px",
                  fontSize: "14px",
                  boxShadow: "var(--shadow-orange)",
                }}
              >
                Simuler mon crédit
              </a>
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 text-white font-semibold rounded-md"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  padding: "15px 26px",
                  fontSize: "14px",
                }}
              >
                Parler à un conseiller
              </a>
            </div>

            {/* Stats */}
            <div
              className="flex justify-center max-w-[600px] mx-auto"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.15)",
                paddingTop: "28px",
              }}
            >
              {[
                { val: "40+", label: "Banques" },
                { val: "94%", label: "Acceptés" },
                { val: "24h", label: "Réponse" },
                { val: "0 €", label: "À l'avance" },
              ].map((stat, idx) => (
                <div
                  key={stat.label}
                  className="text-center px-[26px]"
                  style={
                    idx > 0
                      ? { borderLeft: "1px solid rgba(255,255,255,0.15)" }
                      : undefined
                  }
                >
                  <b className="block text-[25px] font-extrabold text-white tracking-[-0.02em]">
                    {stat.val}
                  </b>
                  <span className="block mt-[3px] text-[10px] text-white/60 uppercase font-semibold tracking-[0.05em]">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMMENT ÇA MARCHE ===== */}
      <section id="comment" className="py-16">
        <div className="wrap">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange mb-[10px] text-center">
            Comment ça marche
          </p>
          <h2 className="text-[30px] font-extrabold text-ink tracking-[-0.02em] text-center mb-3 section-title">
            Trois étapes, zéro complication
          </h2>
          <p className="text-[14px] text-slate text-center max-w-[560px] mx-auto mb-11 leading-[1.7]">
            Un parcours simple et transparent, de la simulation à la signature.
          </p>

          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {[
              {
                num: "01",
                title: "Simulez votre crédit",
                text: "Estimez votre mensualité en quelques secondes grâce à notre simulateur, puis déposez votre demande en ligne.",
              },
              {
                num: "02",
                title: "On compare pour vous",
                text: "Votre courtier analyse votre profil et sollicite nos 40 banques partenaires pour négocier le meilleur taux.",
              },
              {
                num: "03",
                title: "Vous choisissez",
                text: "Vous recevez votre offre sous 24 heures. Nous vous accompagnons jusqu'à la signature, sans aucun frais à l'avance.",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="bg-white border border-line rounded-lg relative"
                style={{ padding: "28px 24px" }}
              >
                <div className="text-[13px] font-extrabold text-orange tracking-[0.1em] mb-[14px]">
                  {step.num}
                </div>
                <h3 className="text-[16px] font-bold text-ink mb-2">{step.title}</h3>
                <p className="text-[13px] text-slate leading-[1.65]">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SIMULATEUR + FORMULAIRE (wrapper client) ===== */}
      <SimulatorAndForm />

      {/* ===== NOS SERVICES ===== */}
      <section
        id="services"
        className="py-16"
        style={{
          background: "var(--color-bg-soft)",
          borderTop: "1px solid var(--color-line-soft)",
        }}
      >
        <div className="wrap">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange mb-[10px] text-center">
            Nos services
          </p>
          <h2 className="text-[30px] font-extrabold text-ink tracking-[-0.02em] text-center mb-3 section-title">
            Un accompagnement pour chaque projet
          </h2>
          <p className="text-[14px] text-slate text-center max-w-[560px] mx-auto mb-11 leading-[1.7]">
            Quel que soit votre besoin de financement, Kredix trouve la solution
            adaptée.
          </p>

          <div
            className="grid gap-[18px] max-w-[840px] mx-auto"
            style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
          >
            {[
              {
                tag: "Immobilier",
                title: "Prêt immobilier",
                text: "Achat, construction ou investissement locatif : nous négocions le meilleur taux pour concrétiser votre projet immobilier.",
              },
              {
                tag: "Consommation",
                title: "Prêt à la consommation",
                text: "Travaux, voiture, projet personnel : obtenez un financement rapide aux conditions les plus compétitives.",
              },
              {
                tag: "Restructuration",
                title: "Rachat de crédits",
                text: "Regroupez vos crédits en une seule mensualité réduite et retrouvez de la sérénité dans votre budget.",
              },
              {
                tag: "Professionnel",
                title: "Prêt professionnel",
                text: "Développez votre activité avec un financement pensé pour les entrepreneurs, indépendants et sociétés.",
              },
            ].map((service) => (
              <div
                key={service.tag}
                className="border border-line rounded-lg bg-white"
                style={{ padding: "26px" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue mb-3">
                  {service.tag}
                </div>
                <h3 className="text-[17px] font-bold text-ink mb-2">
                  {service.title}
                </h3>
                <p className="text-[13px] text-slate leading-[1.65]">
                  {service.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CONTACT ===== */}
      <section id="contact" className="py-16" style={{ background: "var(--color-ink)" }}>
        <div className="wrap">
          <div className="grid gap-11 items-center" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <h2 className="text-[30px] font-extrabold text-white leading-[1.18] mb-[14px] tracking-[-0.02em]">
                Une question ?{" "}
                <em className="not-italic text-[#FFDDBC]">Parlons-en.</em>
              </h2>
              <p className="text-[14px] text-white/60 leading-[1.75] mb-[26px]">
                Votre conseiller Kredix est disponible par WhatsApp ou par
                téléphone. Vous obtenez une réponse dans la journée, sans
                engagement.
              </p>

              <div className="flex flex-col gap-3">
                <a
                  href="https://wa.me/33600000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-[13px] rounded-xl transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "16px 18px",
                  }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0 font-extrabold text-[#7CC0FF]"
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      background: "rgba(43,139,222,0.2)",
                      fontSize: "15px",
                    }}
                  >
                    WA
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-white">WhatsApp</div>
                    <div className="text-[11px] text-white/50 mt-[2px]">
                      Réponse rapide dans la journée
                    </div>
                  </div>
                </a>

                <a
                  href="tel:+33600000000"
                  className="flex items-center gap-[13px] rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "16px 18px",
                  }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0 font-extrabold text-[#7CC0FF]"
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      background: "rgba(43,139,222,0.2)",
                      fontSize: "15px",
                    }}
                  >
                    TEL
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-white">Téléphone</div>
                    <div className="text-[11px] text-white/50 mt-[2px]">
                      +33 6 00 00 00 00
                    </div>
                  </div>
                </a>

                <a
                  href="mailto:conseiller@kredix.fr"
                  className="flex items-center gap-[13px] rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "16px 18px",
                  }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0 font-extrabold text-[#7CC0FF]"
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      background: "rgba(43,139,222,0.2)",
                      fontSize: "15px",
                    }}
                  >
                    @
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-white">Email</div>
                    <div className="text-[11px] text-white/50 mt-[2px]">
                      conseiller@kredix.fr
                    </div>
                  </div>
                </a>
              </div>
            </div>

            {/* Carte engagements */}
            <div
              className="rounded-xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "28px",
              }}
            >
              <p className="text-[14px] font-bold text-white mb-4">Nos engagements</p>
              {[
                { label: "Frais à l'avance", value: "0 €" },
                { label: "Délai de réponse", value: "24 heures" },
                { label: "Banques comparées", value: "40+" },
                { label: "Taux d'acceptation", value: "94%" },
                { label: "Dossiers financés", value: "350+" },
              ].map((row, idx, arr) => (
                <div
                  key={row.label}
                  className="flex justify-between py-[11px] text-[12px]"
                  style={{
                    borderBottom:
                      idx < arr.length - 1
                        ? "1px solid rgba(255,255,255,0.08)"
                        : "none",
                  }}
                >
                  <span className="text-white/50">{row.label}</span>
                  <span className="text-white font-semibold">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-9 pb-6" style={{ background: "#0A0F1C" }}>
        <div className="wrap">
          <div className="flex justify-between items-start gap-6 flex-wrap mb-[26px]">
            <div>
              <div className="text-[20px] font-extrabold text-white/90 mb-[10px]">
                Kredix
              </div>
              <p className="text-[11px] text-white/40 leading-[1.7] max-w-[320px]">
                Courtier en financement. Nous comparons 40 banques pour vous
                obtenir les meilleures conditions de crédit, gratuitement et sans
                engagement.
              </p>
            </div>

            <div className="flex gap-12 flex-wrap">
              <div>
                <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-[0.08em] mb-3">
                  Services
                </h4>
                <a href="#services" className="block text-[12px] text-white/55 mb-[9px]">
                  Prêt immobilier
                </a>
                <a href="#services" className="block text-[12px] text-white/55 mb-[9px]">
                  Prêt consommation
                </a>
                <a href="#services" className="block text-[12px] text-white/55 mb-[9px]">
                  Rachat de crédits
                </a>
                <a href="#services" className="block text-[12px] text-white/55">
                  Prêt professionnel
                </a>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-[0.08em] mb-3">
                  Entreprise
                </h4>
                <a href="#comment" className="block text-[12px] text-white/55 mb-[9px]">
                  Comment ça marche
                </a>
                <a href="#simulateur" className="block text-[12px] text-white/55 mb-[9px]">
                  Simulateur
                </a>
                <a href="#contact" className="block text-[12px] text-white/55">
                  Nous contacter
                </a>
              </div>
            </div>
          </div>

          <div
            className="flex justify-between items-center flex-wrap gap-[10px]"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "18px",
            }}
          >
            <p className="text-[10px] text-white/30 leading-[1.6]">
              Kredix · Intermédiaire en opérations de banque et services de
              paiement · ORIAS n° 00000000 · © 2026
            </p>
            <div className="flex gap-4 flex-wrap">
              <a href="#" className="text-[10px] text-white/35">
                Mentions légales
              </a>
              <a href="#" className="text-[10px] text-white/35">
                Confidentialité
              </a>
              <a href="#" className="text-[10px] text-white/35">
                Se désabonner
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
