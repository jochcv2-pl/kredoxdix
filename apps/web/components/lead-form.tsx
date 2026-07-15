"use client";

import { useEffect, useState } from "react";

// Import statique des labels pour garder le rendu FR exact (DEC-K1).
import {
  LOAN_TYPE_LABELS_FR,
  EMPLOYMENT_STATUS_LABELS_FR,
  DURATION_OPTIONS,
  type LoanType,
  type EmploymentStatus,
} from "@kredix/types";

type SimLoanType = Exclude<LoanType, "autre">;

// Options pour les selects (type & durée).
const LOAN_OPTIONS: LoanType[] = ["immo", "conso", "rachat", "pro", "autre"];
const STATUS_OPTIONS: EmploymentStatus[] = [
  "cdi",
  "cdd",
  "independent",
  "civil-servant",
  "retired",
  "unemployed",
];

// Configuration du formulaire autofill (état partagé avec le simulateur via props).
export interface LeadFormPrefill {
  amount?: number;
  durationYears?: number;
  loanType?: SimLoanType;
}

/**
 * Formulaire de demande — reproduction visuelle exacte (.form-card).
 * Statique pour l'instant (pas de soumission réelle — backend API en Phase 2).
 *
 * L'autofill depuis le simulateur se fait via la prop `prefill` : quand le
 * simulateur déclenche "Obtenir cette offre", le parent passe les données et
 * les champs sont remplis + surlignés (classe .filled) + bandeau autofill affiché.
 */
export default function LeadForm({ prefill }: { prefill?: LeadFormPrefill }) {
  const [amount, setAmount] = useState<string>("");
  const [loanType, setLoanType] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [showAutofill, setShowAutofill] = useState(false);

  // Réagit aux changements de prefill (déclenchés par le simulateur).
  useEffect(() => {
    if (!prefill) return;
    if (prefill.amount !== undefined) {
      setAmount(String(prefill.amount));
    }
    if (prefill.loanType !== undefined) {
      setLoanType(prefill.loanType);
    }
    if (prefill.durationYears !== undefined) {
      setDuration(String(prefill.durationYears));
    }
    setShowAutofill(true);
  }, [prefill]);

  // Un champ est "filled" s'il a été pré-rempli par le simulateur.
  const isAmountFilled = showAutofill && amount !== "";
  const isTypeFilled = showAutofill && loanType !== "";
  const isDurationFilled = showAutofill && duration !== "";

  return (
    <div
      className="bg-white border border-line rounded-xl"
      style={{
        padding: "26px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h3 className="text-[15px] font-bold text-ink mb-[3px]">Déposer ma demande</h3>
      <p className="text-[11px] text-slate-light mb-[18px]">
        Confidentiel · Traitement en 24h
      </p>

      {/* Bandeau autofill */}
      <div
        className={`items-center gap-2 rounded-sm mb-4 text-[10px] font-semibold ${
          showAutofill ? "flex" : "hidden"
        }`}
        style={{
          background: "var(--color-orange-soft)",
          border: "1px solid var(--color-orange-border)",
          color: "#C2610C",
          padding: "9px 12px",
        }}
      >
        <span
          className="w-[7px] h-[7px] rounded-full bg-orange flex-shrink-0"
          aria-hidden
        />
        <span>Données du simulateur chargées automatiquement</span>
      </div>

      {/* Champs */}
      <div
        className="grid gap-[11px] mb-[11px]"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <div className="flex flex-col">
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Prénom
          </label>
          <input
            type="text"
            placeholder="Marie"
            className="lead-input w-full py-[11px] px-[12px] border border-line rounded-sm text-[12px] text-ink font-sans outline-none font-medium"
          />
        </div>
        <div className="flex flex-col">
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Nom
          </label>
          <input
            type="text"
            placeholder="Dupont"
            className="lead-input w-full py-[11px] px-[12px] border border-line rounded-sm text-[12px] text-ink font-sans outline-none font-medium"
          />
        </div>
        <div className="flex flex-col">
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Téléphone
          </label>
          <input
            type="tel"
            placeholder="06 00 00 00 00"
            className="lead-input w-full py-[11px] px-[12px] border border-line rounded-sm text-[12px] text-ink font-sans outline-none font-medium"
          />
        </div>
        <div className="flex flex-col">
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Ville
          </label>
          <input
            type="text"
            placeholder="Paris"
            className="lead-input w-full py-[11px] px-[12px] border border-line rounded-sm text-[12px] text-ink font-sans outline-none font-medium"
          />
        </div>

        {/* Type de prêt (full width) */}
        <div className="flex flex-col" style={{ gridColumn: "1 / -1" }}>
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Type de prêt
          </label>
          <select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value)}
            className={`lead-input w-full py-[11px] px-[12px] border rounded-sm text-[12px] text-ink font-sans outline-none font-medium cursor-pointer ${
              isTypeFilled ? "lead-filled" : ""
            }`}
            style={{ paddingRight: "28px" }}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {LOAN_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {LOAN_TYPE_LABELS_FR[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Montant (full width) */}
        <div className="flex flex-col" style={{ gridColumn: "1 / -1" }}>
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Montant souhaité
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="150 000"
              className={`lead-input w-full py-[11px] px-[12px] border border-line rounded-sm text-[12px] text-ink font-sans outline-none font-medium ${
                isAmountFilled ? "lead-filled" : ""
              }`}
              style={{ paddingRight: "44px" }}
            />
            <span className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[11px] text-slate-light font-semibold">
              €
            </span>
          </div>
        </div>

        {/* Durée (full width) */}
        <div className="flex flex-col" style={{ gridColumn: "1 / -1" }}>
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Durée de remboursement
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={`lead-input w-full py-[11px] px-[12px] border rounded-sm text-[12px] text-ink font-sans outline-none font-medium cursor-pointer ${
              isDurationFilled ? "lead-filled" : ""
            }`}
            style={{ paddingRight: "28px" }}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} ans
              </option>
            ))}
          </select>
        </div>

        {/* Situation pro (full width) */}
        <div className="flex flex-col" style={{ gridColumn: "1 / -1" }}>
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Situation professionnelle
          </label>
          <select
            defaultValue=""
            className="lead-input w-full py-[11px] px-[12px] border border-line rounded-sm text-[12px] text-ink font-sans outline-none font-medium cursor-pointer"
            style={{ paddingRight: "28px" }}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {EMPLOYMENT_STATUS_LABELS_FR[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        className="w-full mt-[13px] bg-orange text-white border-none rounded-[10px] py-[14px] text-[13px] font-bold cursor-pointer font-sans tracking-[0.02em]"
      >
        Envoyer ma demande
      </button>

      {/* Divider "ou" */}
      <div className="flex items-center gap-[11px] my-[13px]">
        <span className="flex-1 h-px bg-line-soft" />
        <span className="text-[10px] text-[#CBD5E0] font-semibold uppercase tracking-[0.06em]">
          ou
        </span>
        <span className="flex-1 h-px bg-line-soft" />
      </div>

      {/* Bouton WhatsApp */}
      <a
        href="https://wa.me/33600000000"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] rounded-[10px] py-3 text-[12px] font-bold font-sans flex items-center justify-center gap-2"
      >
        <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" style={{ fill: "currentColor" }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span>Discuter sur WhatsApp</span>
      </a>
    </div>
  );
}
