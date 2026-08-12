"use client";

import { useState, useEffect, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Search, CheckCircle2, Circle, Loader2, AlertCircle, FileText, User } from "lucide-react";

// =============================================================================
// Page /suivi — Suivi public de dossier client (s44)
// =============================================================================
// Le client entre son numéro KREDIX-XXXXXXXX (reçu par email) ou clique sur
// un lien magique {{lien_suivi}} qui passe ?ref=XXX&token=YYY en query string.
//
// Aucune auth requise. Endpoint public /api/track côté apps/web.
// =============================================================================

interface TrackingStep {
  id: string;
  order: number;
  name: string;
  description: string | null;
  icon: string | null;
  done: boolean;
  validatedAt: string | null;
  validatedByFirstName: string | null;
}

interface TrackResponse {
  reference: string;
  status: string;
  statusLabel: string;
  advisor: { firstName: string } | null;
  steps: TrackingStep[];
  nextActionEstimate: string | null;
}

export default function SuiviPage() {
  const t = useTranslations("Tracking");
  const [ref, setRef] = useState("");
  const [data, setData] = useState<TrackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load si ?ref=XXX&token=YYY dans l'URL (lien magique email).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("ref");
    const tokenParam = params.get("token") ?? undefined;
    if (refParam) {
      setRef(refParam);
      void submit(refParam, tokenParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(refValue: string, token?: string) {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = `/api/track?ref=${encodeURIComponent(refValue)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
      const r = await fetch(url);
      const json = await r.json();
      if (r.ok) {
        setData(json.data);
      } else {
        const code = json.code ?? "NOT_FOUND";
        if (code === "NOT_FOUND") setError(t("notFound"));
        else if (code === "INVALID_REF") setError(t("invalid"));
        else if (code === "RATE_LIMITED") setError(t("rateLimited"));
        else setError(json.error ?? t("genericError"));
      }
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = ref.trim().toUpperCase();
    if (!cleaned) return;
    // Auto-correction : si l'utilisateur a tapé juste les 8 chars, on préfixe.
    const normalized = cleaned.startsWith("KREDIX-") ? cleaned : `KREDIX-${cleaned}`;
    setRef(normalized);
    void submit(normalized);
  }

  function reset() {
    setData(null);
    setError(null);
    setRef("");
    // Nettoie l'URL (enlève ?ref=&token=)
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  // ----- Formatage date -----
  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  // Compte des étapes faites / total
  const doneCount = data?.steps.filter((s) => s.done).length ?? 0;
  const total = data?.steps.length ?? 0;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <section className="suivi-section">
      <div className="suivi-inner">
        {!data && !loading && (
          <>
            <div className="suivi-hero">
              <div className="suivi-hero-icon">
                <FileText size={40} strokeWidth={1.6} />
              </div>
              <h1>{t("title")}</h1>
              <p className="suivi-subtitle">{t("subtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="suivi-form">
              <label htmlFor="ref-input" className="suivi-label">
                {t("inputLabel")}
              </label>
              <div className="suivi-input-row">
                <input
                  id="ref-input"
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="KREDIX-XXXXXXXX"
                  className="suivi-input"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={20}
                  disabled={loading}
                />
                <button type="submit" className="suivi-submit" disabled={loading || !ref.trim()}>
                  <Search size={16} strokeWidth={2} />
                  <span>{t("submitButton")}</span>
                </button>
              </div>
              <p className="suivi-hint">{t("hint")}</p>
            </form>

            {error && (
              <div className="suivi-error">
                <AlertCircle size={18} strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="suivi-loading">
            <Loader2 size={32} className="suivi-spinner" />
            <p>{t("loading")}</p>
          </div>
        )}

        {data && !loading && (
          <div className="suivi-result">
            <div className="suivi-result-head">
              <div>
                <p className="suivi-ref-label">{t("yourReference")}</p>
                <p className="suivi-ref-value">{data.reference}</p>
              </div>
              <button onClick={reset} className="suivi-reset">
                {t("newSearch")}
              </button>
            </div>

            <div className="suivi-status-card">
              <div className="suivi-status-label">{t("statusLabel")}</div>
              <div className="suivi-status-value">{data.statusLabel}</div>
              {data.advisor && (
                <div className="suivi-advisor">
                  <User size={14} strokeWidth={2} />
                  <span>
                    {t("advisorLabel")} : {data.advisor.firstName}
                  </span>
                </div>
              )}
            </div>

            {total > 0 ? (
              <>
                <div className="suivi-progress">
                  <div className="suivi-progress-bar">
                    <div className="suivi-progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="suivi-progress-text">
                    {doneCount} / {total} {t("stepsDone")}
                  </span>
                </div>

                <div className="suivi-timeline">
                  {data.steps.map((step) => (
                    <div
                      key={step.id}
                      className={`suivi-step${step.done ? " done" : ""}`}
                    >
                      <div className="suivi-step-icon">
                        {step.done ? (
                          <CheckCircle2 size={22} strokeWidth={2} />
                        ) : (
                          <Circle size={22} strokeWidth={1.8} />
                        )}
                      </div>
                      <div className="suivi-step-content">
                        <div className="suivi-step-name">{step.name}</div>
                        {step.description && (
                          <div className="suivi-step-desc">{step.description}</div>
                        )}
                        {step.done && step.validatedAt && (
                          <div className="suivi-step-date">
                            {t("validatedOn")} {formatDate(step.validatedAt)}
                            {step.validatedByFirstName && (
                              <span>
                                {" "}
                                {t("by")} {step.validatedByFirstName}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="suivi-empty">{t("noSteps")}</div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .suivi-section {
          min-height: calc(100vh - 200px);
          padding: 60px 20px;
          background: linear-gradient(180deg, var(--bg-soft, #f9fafb) 0%, var(--paper, #fff) 100%);
        }
        .suivi-inner {
          max-width: 560px;
          margin: 0 auto;
        }
        .suivi-hero { text-align: center; margin-bottom: 36px; }
        .suivi-hero-icon {
          width: 80px; height: 80px; margin: 0 auto 16px;
          background: var(--primary-soft, #eff6ff);
          color: var(--primary, #2563eb);
          border-radius: 20px;
          display: flex; align-items: center; justify-content: center;
        }
        .suivi-hero h1 {
          font-size: 28px; font-weight: 800; color: var(--text, #111827);
          margin: 0 0 8px;
        }
        .suivi-subtitle {
          color: var(--text-muted, #6b7280); font-size: 15px; margin: 0;
        }
        .suivi-form {
          background: var(--paper, #fff);
          border: 1px solid var(--line-soft, #e5e7eb);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .suivi-label {
          display: block; font-size: 13px; font-weight: 600;
          color: var(--text, #111827); margin-bottom: 8px;
        }
        .suivi-input-row { display: flex; gap: 8px; }
        .suivi-input {
          flex: 1; padding: 12px 14px; font-size: 15px; font-family: monospace;
          letter-spacing: 0.5px; text-transform: uppercase;
          border: 1px solid var(--line, #d1d5db); border-radius: 10px;
          background: var(--paper, #fff); color: var(--text, #111827);
          outline: none; transition: border-color .15s;
        }
        .suivi-input:focus { border-color: var(--primary, #2563eb); }
        .suivi-input:disabled { opacity: 0.6; }
        .suivi-submit {
          background: var(--primary, #2563eb); color: #fff;
          border: none; border-radius: 10px; padding: 0 18px;
          font-weight: 600; font-size: 14px; cursor: pointer;
          display: flex; align-items: center; gap: 6px;
          transition: background .15s;
        }
        .suivi-submit:hover:not(:disabled) { background: var(--primary-dark, #1d4ed8); }
        .suivi-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .suivi-hint {
          font-size: 12px; color: var(--text-muted, #9ca3af); margin: 10px 0 0;
        }
        .suivi-error {
          margin-top: 16px; padding: 12px 14px;
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 10px; color: #dc2626;
          display: flex; align-items: center; gap: 8px; font-size: 14px;
        }
        .suivi-loading {
          text-align: center; padding: 60px 20px;
          color: var(--text-muted, #6b7280);
        }
        .suivi-spinner { animation: spin 1s linear infinite; margin-bottom: 12px; color: var(--primary, #2563eb); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .suivi-result-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 20px;
        }
        .suivi-ref-label {
          font-size: 12px; color: var(--text-muted, #6b7280);
          text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;
        }
        .suivi-ref-value {
          font-family: monospace; font-size: 20px; font-weight: 700;
          color: var(--text, #111827); margin: 0;
        }
        .suivi-reset {
          background: none; border: 1px solid var(--line, #d1d5db);
          border-radius: 8px; padding: 8px 14px; font-size: 13px;
          color: var(--text-muted, #6b7280); cursor: pointer;
        }
        .suivi-reset:hover { color: var(--text, #111827); border-color: var(--text-muted, #6b7280); }
        .suivi-status-card {
          background: var(--primary-soft, #eff6ff);
          border: 1px solid #bfdbfe;
          border-radius: 12px; padding: 16px 18px; margin-bottom: 24px;
        }
        .suivi-status-label {
          font-size: 12px; color: var(--text-muted, #6b7280);
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .suivi-status-value {
          font-size: 18px; font-weight: 700; color: var(--primary, #1d4ed8);
          margin-top: 4px;
        }
        .suivi-advisor {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--text-muted, #4b5563); margin-top: 10px;
        }
        .suivi-progress { margin-bottom: 24px; }
        .suivi-progress-bar {
          height: 6px; background: var(--line-soft, #e5e7eb);
          border-radius: 3px; overflow: hidden;
        }
        .suivi-progress-fill {
          height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a);
          transition: width .3s ease;
        }
        .suivi-progress-text {
          font-size: 12px; color: var(--text-muted, #6b7280); margin-top: 6px; display: block;
        }
        .suivi-timeline { display: flex; flex-direction: column; gap: 12px; }
        .suivi-step {
          display: flex; gap: 14px; padding: 16px;
          border: 1px solid var(--line-soft, #e5e7eb);
          border-radius: 12px; background: var(--paper, #fff);
          transition: border-color .15s;
        }
        .suivi-step.done {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }
        .suivi-step-icon {
          flex-shrink: 0;
          color: var(--text-muted, #d1d5db);
          display: flex; align-items: flex-start; padding-top: 2px;
        }
        .suivi-step.done .suivi-step-icon { color: #16a34a; }
        .suivi-step-name {
          font-weight: 600; font-size: 15px; color: var(--text, #111827);
        }
        .suivi-step-desc {
          font-size: 13px; color: var(--text-muted, #6b7280); margin-top: 4px;
        }
        .suivi-step-date {
          font-size: 12px; color: #16a34a; margin-top: 8px; font-weight: 500;
        }
        .suivi-empty {
          text-align: center; padding: 40px 20px;
          color: var(--text-muted, #6b7280);
          background: var(--paper, #fff);
          border: 1px dashed var(--line, #d1d5db); border-radius: 12px;
        }
      `}</style>
    </section>
  );
}
