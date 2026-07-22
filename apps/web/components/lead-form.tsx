"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  DURATION_OPTIONS,
  type LoanType,
  type EmploymentStatus,
} from "@kredix/types";

type SimLoanType = Exclude<LoanType, "autre">;

const LOAN_OPTIONS: LoanType[] = ["immo", "conso", "rachat", "pro", "autre"];
const STATUS_OPTIONS: EmploymentStatus[] = [
  "cdi",
  "cdd",
  "independent",
  "civil-servant",
  "retired",
  "unemployed",
];

// Clés de traduction associées à chaque type de prêt.
const LOAN_TYPE_LABEL_KEYS: Record<
  LoanType,
  "loanImmo" | "loanConso" | "loanRachat" | "loanPro" | "loanOther"
> = {
  immo: "loanImmo",
  conso: "loanConso",
  rachat: "loanRachat",
  pro: "loanPro",
  autre: "loanOther",
};

// Clés de traduction associées à chaque situation professionnelle.
const STATUS_LABEL_KEYS: Record<
  EmploymentStatus,
  "statusCDI" | "statusCDD" | "statusIndependent" | "statusCivilServant" | "statusRetired" | "statusUnemployed"
> = {
  cdi: "statusCDI",
  cdd: "statusCDD",
  independent: "statusIndependent",
  "civil-servant": "statusCivilServant",
  retired: "statusRetired",
  unemployed: "statusUnemployed",
};

export interface LeadFormPrefill {
  amount?: number;
  durationYears?: number;
  loanType?: SimLoanType;
  monthlyPayment?: number;
  annualRate?: number;
  totalCost?: number;
}

// Liste des pays (clés de traduction).
const COUNTRY_OPTIONS = [
  "FR", "BE", "CH", "LU", "DE", "ES", "IT", "PT", "NL", "Other",
] as const;
type CountryCode = (typeof COUNTRY_OPTIONS)[number];

const COUNTRY_LABEL_KEYS: Record<CountryCode, `country${CountryCode}`> = {
  FR: "countryFR",
  BE: "countryBE",
  CH: "countryCH",
  LU: "countryLU",
  DE: "countryDE",
  ES: "countryES",
  IT: "countryIT",
  PT: "countryPT",
  NL: "countryNL",
  Other: "countryOther",
};

/**
 * Formulaire de demande — reproduction exacte du HTML (.form-card / .grid2 / .fg).
 * Autofill depuis le simulateur via la prop `prefill`.
 * Soumission via POST /api/leads avec états UI (loading, success, error).
 */
export default function LeadForm({ prefill }: { prefill?: LeadFormPrefill }) {
  const t = useTranslations("LeadForm");
  const tRoot = useTranslations();
  const locale = useLocale();

  // Champs contrôlés
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [employment, setEmployment] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [loanType, setLoanType] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [monthlyPayment, setMonthlyPayment] = useState<string>("");
  const [annualRate, setAnnualRate] = useState<string>("");
  const [totalCost, setTotalCost] = useState<string>("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [showAutofill, setShowAutofill] = useState(false);

  // États de soumission (SKILLS_CORE : loading · error · success)
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

  useEffect(() => {
    if (!prefill) return;
    if (prefill.amount !== undefined) setAmount(String(prefill.amount));
    if (prefill.loanType !== undefined) setLoanType(prefill.loanType);
    if (prefill.durationYears !== undefined) setDuration(String(prefill.durationYears));
    if (prefill.monthlyPayment !== undefined) setMonthlyPayment(String(prefill.monthlyPayment));
    if (prefill.annualRate !== undefined) setAnnualRate(prefill.annualRate.toFixed(1).replace(".", ","));
    if (prefill.totalCost !== undefined) setTotalCost(String(prefill.totalCost));
    setShowAutofill(true);
  }, [prefill]);

  const isAmountFilled = showAutofill && amount !== "";
  const isTypeFilled = showAutofill && loanType !== "";
  const isDurationFilled = showAutofill && duration !== "";
  const isMonthlyFilled = showAutofill && monthlyPayment !== "";
  const isRateFilled = showAutofill && annualRate !== "";
  const isTotalFilled = showAutofill && totalCost !== "";

  // Soumission du formulaire vers POST /api/leads
  const handleSubmit = async () => {
    setFormError("");

    // Validation côté client (Fix 2)
    if (!employment) {
      setFormError("Veuillez sélectionner votre situation professionnelle");
      return;
    }
    if (!loanType) {
      setFormError("Veuillez sélectionner le type de crédit");
      return;
    }
    if (amount === "" || Number(amount) < 5000) {
      setFormError("Le montant minimum est de 5 000 €");
      return;
    }
    if (duration === "" || Number(duration) < 1) {
      setFormError("Veuillez indiquer la durée souhaitée");
      return;
    }
    if (!consent) {
      setFormError("Veuillez accepter d'être contacté(e) pour soumettre votre demande");
      return;
    }

    setSubmitState("loading");
    setSubmitError("");

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email: email || undefined,
          city,
          country: country || "FR",
          loanType,
          amount: Number(amount) || 0,
          durationYears: Number(duration) || 0,
          monthlyPayment: monthlyPayment ? Number(monthlyPayment) : undefined,
          annualRate: annualRate ? Number(annualRate.replace(",", ".")) : undefined,
          totalCost: totalCost ? Number(totalCost) : undefined,
          employmentStatus: employment,
          preferredLanguage: locale,
          whatsappConsent: consent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || "Une erreur est survenue. Veuillez réessayer."
        );
      }

      // Tracking : événement Lead (Facebook Pixel + Google Analytics)
      if (typeof window !== "undefined") {
        const w = window as unknown as { fbq?: (...args: unknown[]) => void; gtag?: (...args: unknown[]) => void };
        w.fbq?.("track", "Lead");
        w.gtag?.("event", "generate_lead", { currency: "EUR", value: 1 });
      }

      setSubmitState("success");
    } catch (err) {
      setSubmitState("error");
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Une erreur inconnue est survenue."
      );
    }
  };

  return (
    <div className="form-card">
      <h3>{t("formTitle")}</h3>
      <p className="fsub">{t("formSub")}</p>

      {/* Bandeau autofill */}
      <div className={showAutofill ? "autofill show" : "autofill"}>
        <span className="dot" aria-hidden />
        <span>{t("autofillText")}</span>
      </div>

      {/* Champs */}
      <div className="grid2">
        <div className="fg">
          <label className="field-label">{t("firstName")}</label>
          <input
            type="text"
            placeholder="Marie"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="fg">
          <label className="field-label">{t("lastName")}</label>
          <input
            type="text"
            placeholder="Dupont"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="fg">
          <label className="field-label">{t("phone")}</label>
          <input
            type="tel"
            placeholder="06 00 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="fg full">
          <label className="field-label">Email (optionnel)</label>
          <input
            type="email"
            placeholder="marie.dupont@email.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="fhint">Pour recevoir votre offre et le tableau d'amortissement par email</span>
        </div>
        <div className="fg">
          <label className="field-label">{t("city")}</label>
          <input
            type="text"
            placeholder="Paris"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        {/* Pays */}
        <div className="fg full">
          <label className="field-label">{t("country")}</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="" disabled>{t("countryPlaceholder")}</option>
            {COUNTRY_OPTIONS.map((code) => (
              <option key={code} value={code}>{t(COUNTRY_LABEL_KEYS[code])}</option>
            ))}
          </select>
        </div>

        {/* Type de prêt */}
        <div className="fg full">
          <label className="field-label">{t("loanType")}</label>
          <select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value)}
            className={isTypeFilled ? "filled" : ""}
          >
            <option value="" disabled>{t("selectPlaceholder")}</option>
            {LOAN_OPTIONS.map((type) => (
              <option key={type} value={type}>{t(LOAN_TYPE_LABEL_KEYS[type])}</option>
            ))}
          </select>
        </div>

        {/* Montant */}
        <div className="fg full">
          <label className="field-label">{t("amount")}</label>
          <div className="montant">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="150 000"
              className={isAmountFilled ? "filled" : ""}
            />
            <span className="sfx">€</span>
          </div>
        </div>

        {/* Durée */}
        <div className="fg full">
          <label className="field-label">{t("duration")}</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={isDurationFilled ? "filled" : ""}
          >
            <option value="" disabled>{t("selectPlaceholder")}</option>
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} {tRoot("years")}</option>
            ))}
          </select>
        </div>

        {/* Mensualité estimée (pré-remplie par le simulateur) */}
        <div className="fg full">
          <label className="field-label">{t("monthlyPayment")}</label>
          <div className="montant">
            <input
              type="text"
              value={monthlyPayment ? `${Number(monthlyPayment).toLocaleString("fr-FR").replace(/,/g, " ")} €` : ""}
              readOnly
              placeholder="—"
              className={isMonthlyFilled ? "filled" : ""}
            />
          </div>
        </div>

        {/* Taux indicatif (pré-rempli par le simulateur) */}
        <div className="fg full">
          <label className="field-label">{t("indicativeRate")}</label>
          <input
            type="text"
            value={annualRate ? `${annualRate} %` : ""}
            readOnly
            placeholder="—"
            className={isRateFilled ? "filled" : ""}
          />
        </div>

        {/* Coût total du crédit (pré-rempli par le simulateur) */}
        <div className="fg full">
          <label className="field-label">{t("totalCost")}</label>
          <div className="montant">
            <input
              type="text"
              value={totalCost ? `${Number(totalCost).toLocaleString("fr-FR").replace(/,/g, " ")} €` : ""}
              readOnly
              placeholder="—"
              className={isTotalFilled ? "filled" : ""}
            />
            <span className="sfx">€</span>
          </div>
        </div>

        {/* Situation pro */}
        <div className="fg full">
          <label className="field-label">{t("employment")}</label>
          <select
            value={employment}
            onChange={(e) => setEmployment(e.target.value)}
          >
            <option value="" disabled>{t("selectPlaceholder")}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Message d'erreur de validation côté client */}
      {formError && (
        <div className="lf-error">{formError}</div>
      )}

      {/* Message de succès */}
      {submitState === "success" && (
        <div className="form-success">
          ✓ {t("successMessage")}
        </div>
      )}

      {/* Message d'erreur */}
      {submitState === "error" && (
        <div className="form-error">
          {submitError}
        </div>
      )}

      {/* Consentement RGPD (Fix 1) */}
      <label className="lf-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        <span>
          J'accepte d'être contacté(e) par WhatsApp et email concernant ma demande de crédit.{" "}
          <a href={`/${locale}/legal/politique-confidentialite`}>(voir notre politique de confidentialité)</a>
        </span>
      </label>

      <button
        type="button"
        className="btn-submit"
        onClick={handleSubmit}
        disabled={submitState === "loading" || submitState === "success"}
      >
        {submitState === "loading" ? t("loading") : t("submit")}
      </button>

      <div className="divider"><span>{t("or")}</span></div>

      {/* Boutons WhatsApp + Messenger côte à côte */}
      <div className="btn-social-grid">
        <a
          href="https://wa.me/33600000000"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-wa"
        >
          <svg viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span>{t("whatsapp")}</span>
        </a>
        <a
          href="https://m.me/kredix"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-messenger"
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.36 2 1.8 6.13 1.8 11.25c0 2.88 1.42 5.45 3.65 7.18V22l3.33-1.83c.95.26 1.96.4 3 .4 5.64 0 10.2-4.13 10.2-9.25S17.64 2 12 2zm1.07 12.25l-2.65-2.83-5.18 2.83 5.69-6.04 2.71 2.83 5.13-2.83-5.7 6.04z" />
          </svg>
          <span>{t("messenger")}</span>
        </a>
      </div>

      <style>{`
        .lf-consent {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 12px 0;
          font-size: 13px;
          color: var(--text-muted, #64748b);
        }
        .lf-consent input[type="checkbox"] {
          margin-top: 3px;
          width: 16px;
          height: 16px;
          accent-color: var(--primary, #2563eb);
          cursor: pointer;
          flex-shrink: 0;
        }
        .lf-consent a {
          color: var(--primary, #2563eb);
          text-decoration: underline;
        }
        .lf-error {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #dc2626;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .fhint {
          display: block;
          font-size: 12px;
          color: var(--text-muted, #64748b);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
