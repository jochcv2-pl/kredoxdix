"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { LoanType, ApplicableRate } from "@kredix/types";
import Simulator from "./simulator";
import LeadForm, { type LeadFormPrefill } from "./lead-form";

type SimLoanType = Exclude<LoanType, "autre">;

/**
 * Orchestrateur client : relie le simulateur au formulaire.
 * Reproduction exacte du HTML (.section.sim-section + .lead-grid).
 *
 * @param rates          — paliers de taux DB passés depuis le server component parent.
 * @param whatsappNumber — numéro WhatsApp (setting contact).
 * @param socialNote     — override CMS de la note sous les boutons sociaux.
 * @param showWhatsapp   — visibilité du bouton WhatsApp (setting CMS).
 * @param showMessenger  — visibilité du bouton Messenger (setting CMS).
 */
export default function SimulatorAndForm({
  rates,
  whatsappNumber,
  socialNote,
  showWhatsapp = true,
  showMessenger = true,
}: {
  rates?: readonly ApplicableRate[];
  whatsappNumber?: string;
  socialNote?: string;
  showWhatsapp?: boolean;
  showMessenger?: boolean;
}) {
  const tSim = useTranslations("Simulator");
  const tForm = useTranslations("LeadForm");
  const [prefill, setPrefill] = useState<LeadFormPrefill | undefined>();

  const handleApply = useCallback(
    (data: {
      amount: number;
      durationYears: number;
      loanType: SimLoanType;
      monthlyPayment: number;
      annualRate: number;
      totalCost: number;
    }) => {
      setPrefill({
        amount: data.amount,
        durationYears: data.durationYears,
        loanType: data.loanType,
        monthlyPayment: data.monthlyPayment,
        annualRate: data.annualRate,
        totalCost: data.totalCost,
      });
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
      {/* ===== SIMULATEUR ===== */}
      <section className="section sim-section" id="simulateur">
        <div className="wrap">
          <p className="section-eyebrow">{tSim("eyebrow")}</p>
          <h2 className="section-title">{tSim("title")}</h2>
          <p className="section-lead">{tSim("lead")}</p>

          <Simulator rates={rates} onApplyToForm={handleApply} />

          <p className="sim-note">{tSim("note")}</p>
        </div>
      </section>

      {/* ===== TEXTE + FORMULAIRE ===== */}
      <section className="section" id="demande">
        <div className="wrap">
          <div className="lead-grid" id="formAnchor">
            {/* Texte à gauche */}
            <div>
              <span className="lead-eyebrow">{tForm("eyebrow")}</span>
              <h2>
                {tForm.rich("title", {
                  highlight: (chunks) => <em>{chunks}</em>,
                })}
              </h2>
              <p className="lead-sub">{tForm("subtitle")}</p>
              <ul className="trust">
                <li>{tForm("trust1")}</li>
                <li>{tForm("trust2")}</li>
                <li>{tForm("trust3")}</li>
                <li>{tForm("trust4")}</li>
              </ul>
            </div>

            {/* Formulaire à droite */}
            <LeadForm
              prefill={prefill}
              whatsappNumber={whatsappNumber}
              rates={rates}
              socialNote={socialNote}
              showWhatsapp={showWhatsapp}
              showMessenger={showMessenger}
            />
          </div>
        </div>
      </section>
    </>
  );
}
