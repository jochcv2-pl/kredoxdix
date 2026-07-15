"use client";

import { useState, useCallback } from "react";
import type { LoanType } from "@kredix/types";
import Simulator from "./simulator";
import LeadForm, { type LeadFormPrefill } from "./lead-form";

type SimLoanType = Exclude<LoanType, "autre">;

/**
 * Orchestrateur client : relie le simulateur au formulaire.
 * - Quand l'utilisateur clique "Obtenir cette offre", le simulateur émet ses données.
 * - On les passe au formulaire (autofill) puis on scroll vers le formulaire.
 *
 * Ce wrapper reste le seul point "use client" de la page ; page.tsx reste un Server Component.
 */
export default function SimulatorAndForm() {
  const [prefill, setPrefill] = useState<LeadFormPrefill | undefined>();

  const handleApply = useCallback(
    (data: { amount: number; durationYears: number; loanType: SimLoanType }) => {
      setPrefill({
        amount: data.amount,
        durationYears: data.durationYears,
        loanType: data.loanType,
      });
      // Scroll vers le formulaire (id="formAnchor").
      requestAnimationFrame(() => {
        document
          .getElementById("formAnchor")
          ?.scrollIntoView({ behavior: "smooth" });
      });
    },
    []
  );

  return (
    <>
      {/* Section simulateur */}
      <section
        id="simulateur"
        className="py-16"
        style={{
          background:
            "linear-gradient(135deg,#EBF5FF 0%,#F7FBFF 55%,#FFF8F0 100%)",
          borderTop: "1px solid var(--color-line-soft)",
          borderBottom: "1px solid var(--color-line-soft)",
        }}
      >
        <div className="wrap">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange mb-[10px] text-center">
            Étape 1 · Simulateur
          </p>
          <h2 className="text-[30px] font-extrabold text-ink tracking-[-0.02em] text-center mb-3">
            Estimez votre mensualité
          </h2>
          <p className="text-[14px] text-slate text-center max-w-[560px] mx-auto mb-11 leading-[1.7]">
            Ajustez le montant et la durée. Votre estimation se met à jour en
            direct.
          </p>

          <Simulator onApplyToForm={handleApply} />

          <p className="text-[10px] text-slate-light text-center mt-[22px] max-w-[640px] mx-auto leading-[1.6]">
            Estimation indicative calculée hors assurance et frais de dossier.
            Le taux définitif dépend de votre profil et de l&apos;établissement
            prêteur. Cette simulation ne constitue pas une offre de crédit.
          </p>
        </div>
      </section>

      {/* Section formulaire */}
      <section id="demande" className="py-16">
        <div className="wrap">
          <div
            id="formAnchor"
            className="grid gap-11 items-center"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            {/* Texte à gauche */}
            <div>
              <span
                className="inline-block rounded-[30px] px-[14px] py-[5px] mb-4 text-[10px] uppercase tracking-[0.06em] font-bold"
                style={{
                  background: "var(--color-orange-soft)",
                  border: "1px solid var(--color-orange-border)",
                  color: "var(--color-orange)",
                }}
              >
                Étape 2 · Votre demande
              </span>
              <h2 className="text-[30px] font-extrabold text-ink leading-[1.18] mb-[14px] tracking-[-0.02em]">
                Votre <em className="not-italic text-orange">financement</em> commence ici.
              </h2>
              <p className="text-[14px] text-slate leading-[1.75] mb-[26px]">
                Simulez votre crédit en quelques secondes, puis laissez-nous vos
                coordonnées. Notre courtier compare 40 banques et vous rappelle
                avec la meilleure offre.
              </p>
              <ul className="list-none flex flex-col gap-[11px]">
                {[
                  "Service gratuit, sans engagement",
                  "40 établissements bancaires comparés",
                  "Courtier dédié, disponible sur WhatsApp",
                  "Sans aucun prépaiement",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-[11px] text-[13px] text-[#475569] font-medium"
                  >
                    <span
                      className="w-[7px] h-[7px] rounded-full bg-blue flex-shrink-0"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Formulaire à droite */}
            <LeadForm prefill={prefill} />
          </div>
        </div>
      </section>
    </>
  );
}
