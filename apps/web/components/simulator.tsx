"use client";

import { useState } from "react";
import {
  calculateLoan,
  formatFrenchNumber,
  roundToDurationStep,
} from "@kredix/simulator";
import { useTranslations } from "next-intl";
import {
  SIMULATOR_LIMITS,
  DURATION_OPTIONS,
  type LoanType,
  type ApplicableRate,
} from "@kredix/types";

// Types de prêt disponibles dans le simulateur (exclut "autre").
type SimLoanType = Exclude<LoanType, "autre">;
const SIM_TYPES: SimLoanType[] = ["immo", "conso", "rachat", "pro"];

// Clés de traduction associées à chaque type de prêt.
const SIM_TYPE_LABEL_KEYS: Record<SimLoanType, "loanImmo" | "loanConso" | "loanRachat" | "loanPro"> = {
  immo: "loanImmo",
  conso: "loanConso",
  rachat: "loanRachat",
  pro: "loanPro",
};

// Valeurs initiales identiques au HTML de référence.
const DEFAULT_AMOUNT = 150000;
const DEFAULT_YEARS = 20;
const DEFAULT_TYPE: SimLoanType = "immo";

/**
 * Simulateur — reproduction exacte du HTML (.sim-body / .sim-controls / .sim-result).
 * Utilise les classes CSS originales de globals.css (DEC-K1 pixel-perfect).
 *
 * @param rates — paliers de taux issus de la DB (fetch SSR côté page).
 *                Si fournis, le simulateur utilise les vrais taux des banques
 *                partenaires (meilleur taux applicable). Sinon, fallback sur
 *                les taux indicatifs hardcoded.
 */
export default function Simulator({
  rates,
  onApplyToForm,
}: {
  rates?: readonly ApplicableRate[];
  onApplyToForm?: (data: {
    amount: number;
    durationYears: number;
    loanType: SimLoanType;
    monthlyPayment: number;
    annualRate: number;
    totalCost: number;
  }) => void;
}) {
  const t = useTranslations("Simulator");
  const tRoot = useTranslations();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [loanType, setLoanType] = useState<SimLoanType>(DEFAULT_TYPE);

  const result = calculateLoan({ amount, durationYears: years, loanType }, rates);
  const yearsLabel = years > 1 ? tRoot("years") : tRoot("year");

  const handleApply = () => {
    const rounded = roundToDurationStep(years, DURATION_OPTIONS);
    // Recalcule avec la durée arrondie pour que les chiffres envoyés au
    // formulaire correspondent exactement au palier sélectionné.
    const roundedResult = calculateLoan(
      { amount, durationYears: rounded, loanType },
      rates,
    );
    onApplyToForm?.({
      amount,
      durationYears: rounded,
      loanType,
      monthlyPayment: roundedResult.monthlyPayment,
      annualRate: roundedResult.annualRate,
      totalCost: roundedResult.totalCost,
    });
  };

  return (
    <div className="sim-body">
      {/* ===== CONTRÔLES ===== */}
      <div className="sim-controls">
        {/* Type de prêt */}
        <div>
          <label className="field-label">{t("typeLabel")}</label>
          <select
            className="sim-select"
            value={loanType}
            onChange={(e) => setLoanType(e.target.value as SimLoanType)}
          >
            {SIM_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(SIM_TYPE_LABEL_KEYS[type])}
              </option>
            ))}
          </select>
        </div>

        {/* Slider montant */}
        <div>
          <div className="slider-top">
            <span className="name">{t("amountLabel")}</span>
            <span className="val">{formatFrenchNumber(amount)} €</span>
          </div>
          <input
            type="range"
            min={SIMULATOR_LIMITS.AMOUNT_MIN}
            max={SIMULATOR_LIMITS.AMOUNT_MAX}
            step={SIMULATOR_LIMITS.AMOUNT_STEP}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="slider-mm">
            <span>5 000 €</span>
            <span>500 000 €</span>
          </div>
        </div>

        {/* Slider durée */}
        <div>
          <div className="slider-top">
            <span className="name">{t("durationLabel")}</span>
            <span className="val">{years} {yearsLabel}</span>
          </div>
          <input
            type="range"
            min={SIMULATOR_LIMITS.DURATION_MIN}
            max={SIMULATOR_LIMITS.DURATION_MAX}
            step={1}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
          />
          <div className="slider-mm">
            <span>1 {tRoot("year")}</span>
            <span>30 {tRoot("years")}</span>
          </div>
        </div>
      </div>

      {/* ===== RÉSULTAT ===== */}
      <div className="sim-result">
        <p className="rlabel">{t("resultLabel")}</p>
        <div className="amount">
          {formatFrenchNumber(result.monthlyPayment)} <small>€</small>
        </div>
        <p className="period">{tRoot("perMonth")} {years} {yearsLabel}</p>
        <div className="sim-detail">
          <span>{t("rateLabel")}</span>
          <span>{result.annualRate.toFixed(1).replace(".", ",")} %</span>
        </div>
        <div className="sim-detail">
          <span>{t("totalLabel")}</span>
          <span>{formatFrenchNumber(result.totalCost)} €</span>
        </div>
        <button type="button" className="sim-cta" onClick={handleApply}>
          {t("cta")}
        </button>
      </div>
    </div>
  );
}
