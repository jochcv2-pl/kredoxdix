"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { calculateLoan } from "@kredix/simulator";
import {
  DURATION_OPTIONS,
  type LoanType,
  type EmploymentStatus,
  type ApplicableRate,
} from "@kredix/types";

type SimLoanType = Exclude<LoanType, "autre">;

// Types de prêt pour lesquels l'estimation automatique est possible
// (calculateLoan repose sur des taux connus — types dynamiques custom exclus).
const ESTIMATABLE_TYPES: readonly string[] = ["immo", "conso", "rachat", "pro"];

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
 * Estimation automatique : quand le prospect remplit montant + durée + type
 * lui-même (sans passer par le simulateur), mensualité/taux/coût total se
 * calculent via `calculateLoan` (mêmes taux DB que le simulateur).
 * Boutons sociaux (WhatsApp/Messenger) et note visibles/configurables via settings CMS.
 * Soumission via POST /api/leads avec états UI (loading, success, error).
 */
export default function LeadForm({
  prefill,
  whatsappNumber,
  rates,
  socialNote,
  showWhatsapp = true,
  showMessenger = true,
}: {
  prefill?: LeadFormPrefill;
  whatsappNumber?: string;
  /** Paliers de taux DB (même source que le simulateur). */
  rates?: readonly ApplicableRate[];
  /** Override CMS de la note sous les boutons sociaux (fallback i18n si vide). */
  socialNote?: string;
  showWhatsapp?: boolean;
  showMessenger?: boolean;
}) {
  const t = useTranslations("LeadForm");
  const tRoot = useTranslations();
  const locale = useLocale();

  // Champs contrôlés
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("");
  const [employment, setEmployment] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [loanType, setLoanType] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [monthlyPayment, setMonthlyPayment] = useState<string>("");
  const [annualRate, setAnnualRate] = useState<string>("");

  // DEC-K5 — Types de prêt dynamiques depuis la DB (fallback sur liste codée si indisponible).
  const [loanTypeOptions, setLoanTypeOptions] = useState<{ code: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/loan-types")
      .then((r) => r.json())
      .then((json) => setLoanTypeOptions(json.data ?? []))
      .catch(() => {});
  }, []);
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
    if (prefill.annualRate !== undefined) setAnnualRate(prefill.annualRate.toFixed(1));
    if (prefill.totalCost !== undefined) setTotalCost(String(prefill.totalCost));
    setShowAutofill(true);
  }, [prefill]);

  // ----- Estimation automatique (même moteur que le simulateur) -----
  // Quand montant + durée + type (estimable) sont remplis par le prospect
  // directement dans le formulaire, on calcule mensualité / taux / coût total
  // avec calculateLoan — donc avec les taux DB des banques partenaires quand
  // ils sont fournis (fallback taux indicatifs sinon).
  // Les champs restent éditables : toute saisie manuelle bascule `estimateSource`
  // sur "manual" (le hint disparaît) jusqu'au prochain changement de montant/durée/type.
  const [estimateSource, setEstimateSource] = useState<"none" | "auto" | "manual">("none");

  useEffect(() => {
    const amountNum = Number(amount);
    const durationNum = Number(duration);
    const estimable = ESTIMATABLE_TYPES.includes(loanType);
    const isValid =
      amount !== "" && amountNum >= 5000 &&
      duration !== "" && durationNum >= 1 &&
      estimable;
    if (isValid) {
      try {
        const result = calculateLoan(
          { amount: amountNum, durationYears: durationNum, loanType: loanType as SimLoanType },
          rates,
        );
        setMonthlyPayment(String(result.monthlyPayment));
        setAnnualRate(result.annualRate.toFixed(1));
        setTotalCost(String(result.totalCost));
        setEstimateSource("auto");
      } catch {
        // Entrée hors bornes pendant la saisie — on n'écrase rien.
      }
    } else if (estimateSource === "auto" && !estimable && loanType !== "") {
      // Type non estimable sélectionné après une estimation automatique :
      // les chiffres affichés correspondent à l'ancien type → on les retire
      // (les saisies manuelles du prospect ne sont jamais effacées).
      setMonthlyPayment("");
      setAnnualRate("");
      setTotalCost("");
      setEstimateSource("none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, duration, loanType, rates]);

  const isAmountFilled = amount !== "";
  const isTypeFilled = loanType !== "";
  const isDurationFilled = duration !== "";
  const isMonthlyFilled = monthlyPayment !== "";
  const isRateFilled = annualRate !== "";
  const isTotalFilled = totalCost !== "";

  // Soumission du formulaire vers POST /api/leads
  const handleSubmit = async () => {
    setFormError("");

    // Validation côté client (clés i18n — SKILLS_CORE : jamais de texte hardcoded)
    if (!employment) {
      setFormError(t("validationEmployment"));
      return;
    }
    if (!loanType) {
      setFormError(t("validationLoanType"));
      return;
    }
    if (amount === "" || Number(amount) < 5000) {
      setFormError(t("validationAmount"));
      return;
    }
    if (duration === "" || Number(duration) < 1) {
      setFormError(t("validationDuration"));
      return;
    }
    if (!consent) {
      setFormError(t("validationConsent"));
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
          street: street || undefined,
          zipCode: zipCode || undefined,
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
          errorData?.error || t("errorGeneric")
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
          : t("errorUnknown")
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
          <label className="field-label">{t("emailOptional")}</label>
          <input
            type="email"
            placeholder="marie.dupont@email.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="fhint">{t("emailHint")}</span>
        </div>
        <div className="fg">
          <label className="field-label">{t("street")}</label>
          <input
            type="text"
            placeholder="123 Rue de la Paix"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />
        </div>
        <div className="fg">
          <label className="field-label">{t("zipCode")}</label>
          <input
            type="text"
            placeholder="75001"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
          />
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
            {(loanTypeOptions.length > 0
              ? loanTypeOptions
              : LOAN_OPTIONS.map((lt) => ({ code: lt, label: t(LOAN_TYPE_LABEL_KEYS[lt]) }))
            ).map((type) => (
              <option key={type.code} value={type.code}>{type.label}</option>
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

        {/* Mensualité estimée (auto-calculée ou pré-remplie par le simulateur, éditable) */}
        <div className="fg full">
          <label className="field-label">{t("monthlyPayment")}</label>
          <div className="montant">
            <input
              type="number"
              value={monthlyPayment}
              onChange={(e) => { setMonthlyPayment(e.target.value); setEstimateSource("manual"); }}
              placeholder="—"
              className={isMonthlyFilled ? "filled" : ""}
            />
            <span className="sfx">€</span>
          </div>
        </div>

        {/* Taux indicatif (auto-calculé ou pré-rempli par le simulateur, éditable) */}
        <div className="fg full">
          <label className="field-label">{t("indicativeRate")}</label>
          <div className="montant">
            <input
              type="number"
              step="0.1"
              value={annualRate}
              onChange={(e) => { setAnnualRate(e.target.value); setEstimateSource("manual"); }}
              placeholder="—"
              className={isRateFilled ? "filled" : ""}
            />
            <span className="sfx">%</span>
          </div>
        </div>

        {/* Coût total du crédit (auto-calculé ou pré-rempli par le simulateur, éditable) */}
        <div className="fg full">
          <label className="field-label">{t("totalCost")}</label>
          <div className="montant">
            <input
              type="number"
              value={totalCost}
              onChange={(e) => { setTotalCost(e.target.value); setEstimateSource("manual"); }}
              placeholder="—"
              className={isTotalFilled ? "filled" : ""}
            />
            <span className="sfx">€</span>
          </div>
          {estimateSource === "auto" && (
            <span className="fhint">{t("autoEstimateHint")}</span>
          )}
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

      {/* Consentement RGPD (clé i18n —jamais de texte hardcoded) */}
      <label className="lf-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        <span>
          {t("consentText")}{" "}
          <a href={`/${locale}/legal/politique-confidentialite`}>{t("consentLink")}</a>
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

      {/* Boutons WhatsApp + Messenger — visibilité pilotée par le CMS.
          Garde côté rendu : au moins un bouton (si les deux sont masqués en DB,
          on réaffiche les deux plutôt que de laisser le bloc vide). */}
      {(() => {
        const wa = showWhatsapp || !showMessenger;
        const ms = showMessenger || !showWhatsapp;
        const single = wa !== ms; // un seul bouton → pleine largeur
        return (
          <div className={`btn-social-grid${single ? " single" : ""}`}>
            {wa && (
              <a
                href={whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/[^\d]/g, "")}` : "https://wa.me/33600000000"}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-wa"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span>{t("whatsapp")}</span>
              </a>
            )}
            {ms && (
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
            )}
          </div>
        );
      })()}

      <p className="btn-social-note">{socialNote?.trim() || t("socialNote")}</p>

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
