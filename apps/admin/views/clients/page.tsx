'use client'

import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Vue Clients — Parcours d'accompagnement en 7 niveaux.
// =============================================================================
// Liste les prospects validés comme clients (GET /api/clients) et permet à
// l'admin de déclencher l'envoi d'un niveau (POST /api/clients/[id]/send-level).
// Chaque niveau envoyé est verrouillé (un envoi unique par niveau et par client).
// =============================================================================

// Libellés métier des 7 niveaux (alignés avec EmailTrigger.level_N).
const LEVEL_NAMES: Record<number, string> = {
  1: 'Accueil client',
  2: 'Demande de documents',
  3: 'Offre de prêt formelle',
  4: 'Vérification du dossier',
  5: 'Accord de principe',
  6: 'Signature',
  7: 'Déblocage des fonds',
}

const ALL_LEVELS = [1, 2, 3, 4, 5, 6, 7]

interface ClientStepInfo {
  id: string
  level: number
  sentAt: string
}

interface Client {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string
  city: string
  loanType: string
  amount: number
  monthlyPayment: number | null
  steps: ClientStepInfo[]
  currentLevel: number
  updatedAt: string
}

interface SendTarget {
  client: Client
  level: number
}

// Formate une date ISO en JJ/MM/AAAA court.
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}

// Formate un montant entier en euros (ex: 150000 → "150 000 €").
function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null)
  const [sending, setSending] = useState(false)
  // Message de retour (succès/erreur) par client, affiché sous la carte.
  const [feedback, setFeedback] = useState<Record<string, { type: 'ok' | 'err'; msg: string }>>({})

  const fetchClients = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/clients')
      const json = await res.json()
      if (json.data) {
        setClients(json.data)
      } else if (json.error) {
        setError(json.error)
      }
    } catch (e) {
      console.error('fetchClients:', e)
      setError('Impossible de charger les clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const handleSend = async () => {
    if (!sendTarget) return
    const { client, level } = sendTarget
    setSending(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/send-level`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      })
      const json = await res.json()
      if (!res.ok) {
        setFeedback({
          [client.id]: { type: 'err', msg: json.error ?? "Échec de l'envoi" },
        })
      } else {
        setFeedback({
          [client.id]: { type: 'ok', msg: `Niveau ${level} envoyé à ${client.email ?? '—'}` },
        })
        await fetchClients()
      }
    } catch (e) {
      console.error('handleSend:', e)
      setFeedback({ [client.id]: { type: 'err', msg: 'Erreur réseau lors de l\'envoi' } })
    } finally {
      setSending(false)
      setSendTarget(null)
    }
  }

  return (
    <section className="view" id="clients">
      <style>{`
        .clt-head { margin-bottom: 20px; }
        .clt-head h2 { font-size: 22px; font-weight: 600; color: var(--text); margin: 0 0 4px; }
        .clt-head p { margin: 0; color: var(--slate); font-size: 14px; }

        .clt-levels-banner {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 8px;
          padding: 14px 16px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          margin-bottom: 20px;
        }
        .clt-level-cell { display: flex; gap: 8px; align-items: baseline; font-size: 13px; }
        .clt-level-cell b { color: var(--blue-deep); min-width: 64px; }
        .clt-level-cell span { color: var(--text); }

        .clt-card {
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 14px;
        }
        .clt-row { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
        .clt-name { font-size: 16px; font-weight: 600; color: var(--text); }
        .clt-sub { font-size: 13px; color: var(--slate); margin-top: 2px; }
        .clt-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
        .clt-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 500;
          background: var(--bg); color: var(--blue-deep); border: 1px solid var(--border);
        }
        .clt-current {
          font-size: 13px; color: var(--slate); margin-top: 10px;
        }
        .clt-current b { color: var(--text); }

        .clt-levels { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
        .lvl-btn {
          flex: 1 1 0;
          min-width: 96px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--white);
          color: var(--text);
          font-size: 12px;
          cursor: pointer;
          text-align: left;
          transition: border-color .15s, box-shadow .15s, background .15s;
          display: flex; flex-direction: column; gap: 2px;
        }
        .lvl-btn:hover { border-color: var(--blue-deep); }
        .lvl-btn .lvl-num { font-weight: 600; font-size: 11px; color: var(--slate); }
        .lvl-btn .lvl-label { font-weight: 500; }
        .lvl-btn.done {
          background: var(--green, #16a34a);
          border-color: var(--green, #16a34a);
          color: #fff;
          cursor: default;
        }
        .lvl-btn.done .lvl-num,
        .lvl-btn.done .lvl-label { color: #fff; }
        .lvl-btn.done:hover { border-color: var(--green, #16a34a); }
        .lvl-btn.next {
          border-color: var(--blue-deep);
          box-shadow: 0 0 0 1px var(--blue-deep);
        }
        .lvl-btn:disabled { cursor: default; opacity: 1; }

        .clt-feedback { margin-top: 10px; font-size: 13px; }
        .clt-feedback.ok { color: var(--green, #16a34a); }
        .clt-feedback.err { color: var(--red); }

        .clt-loading { padding: 40px; text-align: center; color: var(--slate); }
        .clt-empty {
          padding: 40px; text-align: center; color: var(--slate);
          background: var(--white); border: 1px solid var(--border); border-radius: 10px;
        }
      `}</style>

      <div className="clt-head">
        <h2>Clients</h2>
        <p>Parcours d&apos;accompagnement en 7 niveaux</p>
      </div>

      <div className="clt-levels-banner">
        {ALL_LEVELS.map((lvl) => (
          <div className="clt-level-cell" key={lvl}>
            <b>Niveau {lvl}</b>
            <span>— {LEVEL_NAMES[lvl]}</span>
          </div>
        ))}
      </div>

      {loading && <div className="clt-loading">Chargement des clients…</div>}

      {!loading && error && (
        <div className="clt-card">
          <p className="clt-feedback err">{error}</p>
        </div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="clt-empty">
          Aucun client. Validez des prospects depuis l&apos;onglet «&nbsp;Prospects &amp; clients&nbsp;».
        </div>
      )}

      {!loading && !error && clients.map((client) => {
        const stepsByLevel = new Map<number, string>()
        for (const s of client.steps) stepsByLevel.set(s.level, s.sentAt)
        const currentLevel = client.currentLevel
        const nextLevel = currentLevel + 1

        return (
          <div className="clt-card" key={client.id}>
            <div className="clt-row">
              <div>
                <div className="clt-name">{client.firstName} {client.lastName}</div>
                <div className="clt-sub">
                  {client.email ?? '—'}{client.phone ? ` · ${client.phone}` : ''}
                  {client.city ? ` · ${client.city}` : ''}
                </div>
                <div className="clt-meta">
                  <span className="clt-badge">{client.loanType}</span>
                  <span className="clt-badge">{formatEuro(client.amount)}</span>
                  {client.monthlyPayment != null && (
                    <span className="clt-badge">{formatEuro(client.monthlyPayment)}/mois</span>
                  )}
                </div>
              </div>
              <div className="clt-current">
                Niveau actuel&nbsp;: <b>{currentLevel}/7</b>
              </div>
            </div>

            <div className="clt-levels">
              {ALL_LEVELS.map((lvl) => {
                const sentAt = stepsByLevel.get(lvl)
                const isDone = !!sentAt
                const isNext = lvl === nextLevel
                if (isDone) {
                  return (
                    <div
                      className="lvl-btn done"
                      key={lvl}
                      title={`Envoyé le ${formatDate(sentAt)}`}
                    >
                      <span className="lvl-num">Niveau {lvl} ✅</span>
                      <span className="lvl-label">{LEVEL_NAMES[lvl]}</span>
                      <span className="lvl-num">{formatDate(sentAt)}</span>
                    </div>
                  )
                }
                return (
                  <button
                    type="button"
                    className={`lvl-btn${isNext ? ' next' : ''}`}
                    key={lvl}
                    onClick={() => setSendTarget({ client, level: lvl })}
                    disabled={sending && sendTarget?.client.id === client.id && sendTarget?.level === lvl}
                  >
                    <span className="lvl-num">Niveau {lvl}</span>
                    <span className="lvl-label">{LEVEL_NAMES[lvl]}</span>
                    <span className="lvl-num">Envoyer →</span>
                  </button>
                )
              })}
            </div>

            {feedback[client.id] && (
              <p className={`clt-feedback ${feedback[client.id].type}`}>
                {feedback[client.id].msg}
              </p>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        isOpen={!!sendTarget}
        variant="info"
        title={`Envoyer le niveau ${sendTarget?.level ?? ''} ?`}
        message={
          <>
            Voulez-vous envoyer le <strong>niveau {sendTarget?.level} — {sendTarget ? LEVEL_NAMES[sendTarget.level] : ''}</strong>{' '}
            à <strong>{sendTarget?.client.firstName} {sendTarget?.client.lastName}</strong>&nbsp;?
            <br />
            Un email sera envoyé à <strong>{sendTarget?.client.email ?? '—'}</strong> avec les documents associés en pièce jointe.
          </>
        }
        confirmLabel={sending ? 'Envoi…' : 'Envoyer'}
        onConfirm={handleSend}
        onClose={() => { if (!sending) setSendTarget(null) }}
      />
    </section>
  )
}
