"use client";

import { useState } from "react";
import {
  calculateLoan,
  formatFrenchNumber,
  roundToDurationStep,
} from "@kredix/simulator";
import {
  LOAN_TYPE_LABELS_FR,
  SIMULATOR_LIMITS,
  DURATION_OPTIONS,
  type LoanType,
} from "@kredix/types";

// Types de prêt disponibles dans le simulateur (exclut "autre").
type SimLoanType = Exclude<LoanType, "autre">;
const SIM_TYPES: SimLoanType[] = ["immo", "conso", "rachat", "pro"];

// Valeurs initiales identiques au HTML de référence.
const DEFAULT_AMOUNT = 150000;
const DEFAULT_YEARS = 20;
const DEFAULT_TYPE: SimLoanType = "immo";

/**
 * Simulateur — reproduction visuelle exacte (.sim-body / .sim-controls / .sim-result)
 * + interactivité : calcul en temps réel via calculateLoan, autofill via prop callback.
 *
 * Le résultat est calculé avec calculateLoan (package @kredix/simulator) pour rester
 * cohérent avec le backend (DEC-K1 : même logique que le HTML de référence).
 */
export default function Simulator({
  onApplyToForm,
}: {
  onApplyToForm?: (data: {
    amount: number;
    durationYears: number;
    loanType: SimLoanType;
  }) => void;
}) {
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [loanType, setLoanType] = useState<SimLoanType>(DEFAULT_TYPE);

  // Calcul en temps réel via le package partagé.
  const result = calculateLoan({ amount, durationYears: years, loanType });

  const yearsLabel = years > 1 ? "ans" : "an";

  const handleApply = () => {
    // Arrondit la durée au palier du select du formulaire (5,10,15,20,25,30).
    const rounded = roundToDurationStep(years, DURATION_OPTIONS);
    onApplyToForm?.({ amount, durationYears: rounded, loanType });
  };

  return (
    <div
      className="grid gap-8 max-w-[820px] mx-auto items-center"
      style={{ gridTemplateColumns: "1.2fr 1fr" }}
    >
      {/* ===== CONTRÔLES ===== */}
      <div className="flex flex-col gap-6">
        {/* Type de prêt */}
        <div>
          <label className="block text-[10px] text-slate font-semibold uppercase tracking-[0.04em] mb-[6px]">
            Type de prêt
          </label>
          <select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value as SimLoanType)}
            className="sim-select w-full py-[11px] px-[12px] bg-white border border-line rounded-sm text-[13px] text-ink font-sans font-semibold appearance-none cursor-pointer"
            style={{ paddingRight: "30px" }}
          >
            {SIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {LOAN_TYPE_LABELS_FR[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Slider montant */}
        <div>
          <div className="flex justify-between items-baseline mb-[11px]">
            <span className="text-[12px] font-semibold text-slate">Montant</span>
            <span className="text-[21px] font-extrabold text-blue tracking-[-0.02em]">
              {formatFrenchNumber(amount)} €
            </span>
          </div>
          <input
            type="range"
            min={SIMULATOR_LIMITS.AMOUNT_MIN}
            max={SIMULATOR_LIMITS.AMOUNT_MAX}
            step={SIMULATOR_LIMITS.AMOUNT_STEP}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="sim-range w-full h-[6px] rounded-[6px] bg-[#DCE6F0] outline-none appearance-none"
          />
          <div className="flex justify-between mt-[7px] text-[9px] text-[#B4C4D6] font-semibold">
            <span>5 000 €</span>
            <span>500 000 €</span>
          </div>
        </div>

        {/* Slider durée */}
        <div>
          <div className="flex justify-between items-baseline mb-[11px]">
            <span className="text-[12px] font-semibold text-slate">
              Durée de remboursement
            </span>
            <span className="text-[21px] font-extrabold text-blue tracking-[-0.02em]">
              {years} {yearsLabel}
            </span>
          </div>
          <input
            type="range"
            min={SIMULATOR_LIMITS.DURATION_MIN}
            max={SIMULATOR_LIMITS.DURATION_MAX}
            step={1}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="sim-range w-full h-[6px] rounded-[6px] bg-[#DCE6F0] outline-none appearance-none"
          />
          <div className="flex justify-between mt-[7px] text-[9px] text-[#B4C4D6] font-semibold">
            <span>1 an</span>
            <span>30 ans</span>
          </div>
        </div>
      </div>

      {/* ===== RÉSULTAT ===== */}
      <div
        className="rounded-xl p-7 text-center text-white"
        style={{
          background: "linear-gradient(160deg, var(--color-blue), var(--color-blue-dark))",
          boxShadow: "var(--shadow-blue)",
          padding: "28px 26px",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70 mb-2">
          Mensualité estimée
        </p>
        <div className="text-[42px] font-extrabold tracking-[-0.03em] leading-none mb-[5px]">
          {formatFrenchNumber(result.monthlyPayment)} <small className="text-[16px] font-semibold">€</small>
        </div>
        <p className="text-[11px] text-white/60 mb-5">
          par mois sur {years} {yearsLabel}
        </p>
        <div className="flex justify-between py-[9px] border-t border-white/15 text-[11px]">
          <span className="text-white/60">Taux indicatif</span>
          <span className="font-bold">
            {result.annualRate.toFixed(1).replace(".", ",")} %
          </span>
        </div>
        <div className="flex justify-between py-[9px] border-t border-white/15 text-[11px]">
          <span className="text-white/60">Coût total du crédit</span>
          <span className="font-bold">
            {formatFrenchNumber(result.totalCost)} €
          </span>
        </div>
        <button
          type="button"
          onClick={handleApply}
          className="w-full mt-[18px] bg-orange text-white border-none rounded-[10px] py-[13px] text-[13px] font-bold cursor-pointer font-sans tracking-[0.01em]"
        >
          Obtenir cette offre maintenant
        </button>
      </div>
    </div>
  );
}
