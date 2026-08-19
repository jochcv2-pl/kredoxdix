'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'
import { Pagination } from '@/components/Pagination'

// =============================================================================
// Vue Clients — Parcours d'accompagnement (étapes configurables).
// =============================================================================
// Liste les prospects validés comme clients (GET /api/clients) et permet à
// l'admin de déclencher l'envoi d'une étape (POST /api/clients/[id]/send-level).
// Les étapes sont chargées dynamiquement depuis /api/pipeline-steps.
// Chaque étape envoyée est verrouillée (un envoi unique par étape et par client).
// 100% manuel : aucun envoi automatique.
// =============================================================================

interface PipelineStep {
  id: string
  order: number
  name: string
  description: string | null
  templateId: string | null
  documentId: string | null
  isActive: boolean
  template: { id: string; name: string; subject: string; language: string } | null
  document: { id: string; name: string; fileName: string } | null
}

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
  assignedToId: string | null
  assignedToName: string | null
  assignedToRole: string | null
}

interface SendTarget {
  client: Client
  step: PipelineStep
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
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null)
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  // Message de retour (succès/erreur) par client, affiché sous la carte.
  const [feedback, setFeedback] = useState<Record<string, { type: 'ok' | 'err'; msg: string }>>({})
  // Pagination serveur (20/page).
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null)
  // Recherche nom/email (debounce 350 ms — setters batchés → un seul fetch).
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearchChange = (value: string) => {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchQuery(value.trim())
      setPage(1)
    }, 350)
  }

  const fetchPipelineSteps = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline-steps', { cache: 'no-store' })
      const json = await res.json()
      if (json.data) {
        // Uniquement les étapes actives, triées par order.
        setPipelineSteps(json.data.filter((s: PipelineStep) => s.isActive))
      }
    } catch (e) {
      console.error('fetchPipelineSteps:', e)
    }
  }, [])

  const fetchClients = useCallback(async (targetPage?: number) => {
    try {
      setError(null)
      // Sanitize : onClick={fetchClients} passe l'Event → ignoré (pas un number).
      const p = typeof targetPage === 'number' ? targetPage : page
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
      const res = await fetch(`/api/clients?pageSize=20&page=${p}${searchParam}`)
      const json = await res.json()
      if (json.data?.clients) {
        setClients(json.data.clients)
        setPagination(json.data.pagination ?? null)
      } else if (json.error) {
        setError(json.error)
      }
    } catch (e) {
      console.error('fetchClients:', e)
      setError('Impossible de charger les clients')
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  useEffect(() => {
    Promise.all([fetchPipelineSteps(), fetchClients(page)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery])

  useEffect(() => {
    Promise.all([fetchPipelineSteps(), fetchClients()])
  }, [fetchPipelineSteps, fetchClients])

  const handleSend = async () => {
    if (!sendTarget) return
    const { client, step } = sendTarget
    setSending(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/send-level`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: step.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setFeedback({
          [client.id]: { type: 'err', msg: json.error ?? "Échec de l'envoi" },
        })
      } else {
        setFeedback({
          [client.id]: { type: 'ok', msg: `${step.name} envoyé à ${client.email ?? '—'}` },
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

  const totalSteps = pipelineSteps.length
  const completedSteps = clients.filter((c) => c.currentLevel >= totalSteps).length

  return (
    <section className="view" id="clients">
      <style>{`
        .clt-head { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .clt-head h2 { font-size: 22px; font-weight: 700; color: var(--text); margin: 0 0 4px; }
        .clt-head p { margin: 0; color: var(--slate); font-size: 14px; }

        .clt-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }

        .clt-card2 {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
          overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .clt-card2:hover { border-color: #cbd5e1; box-shadow: 0 6px 24px rgba(0,0,0,0.06); }

        .clt2-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px; border-bottom: 1px solid #f1f5f9;
        }
        .clt2-h-left { display: flex; align-items: center; gap: 12px; }
        .clt2-avatar {
          width: 42px; height: 42px; border-radius: 11px;
          display: grid; place-items: center; font-size: 16px; font-weight: 700;
          flex-shrink: 0; color: #fff;
        }
        .clt2-name { font-size: 15px; font-weight: 700; color: #1e293b; }
        .clt2-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }

        .clt2-progress-ring {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px; border-radius: 20px;
          background: #f1f5f9;
        }
        .clt2-progress-num { font-size: 18px; font-weight: 700; color: #1E6FB8; }
        .clt2-progress-label { font-size: 11px; color: #64748b; font-weight: 500; }

        .clt2-body { padding: 14px 20px; display: flex; gap: 20px; flex-wrap: wrap; align-items: center; }
        .clt2-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .clt2-tag {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 7px;
        }
        .clt2-tag.type { background: rgba(43,139,222,0.08); color: #1E6FB8; }
        .clt2-tag.amount { background: rgba(34,197,94,0.08); color: #15803d; }
        .clt2-tag.monthly { background: rgba(139,92,246,0.08); color: #7c3aed; }
        .clt2-tag svg { opacity: 0.7; }

        .clt2-bar-wrap { flex: 1; min-width: 120px; }
        .clt2-bar-track {
          height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden;
        }
        .clt2-bar-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #22c55e, #16a34a);
          transition: width 0.4s ease;
        }

        .clt2-levels {
          display: grid;
          gap: 0;
          padding: 0; border-top: 1px solid #f1f5f9;
        }

        .clt2-lvl {
          position: relative; padding: 12px 8px; text-align: center;
          cursor: pointer; transition: background 0.15s;
          border-right: 1px solid #f8fafc;
        }
        .clt2-lvl:last-child { border-right: none; }

        .clt2-lvl-num {
          width: 28px; height: 28px; border-radius: 50%;
          display: grid; place-items: center; margin: 0 auto 6px;
          font-size: 12px; font-weight: 700;
          transition: all 0.15s;
        }
        .clt2-lvl-label {
          font-size: 10px; font-weight: 500; color: #94a3b8;
          line-height: 1.3;
        }

        .clt2-lvl.done .clt2-lvl-num {
          background: #22c55e; color: #fff;
        }
        .clt2-lvl.done .clt2-lvl-label { color: #15803d; }

        .clt2-lvl.next .clt2-lvl-num {
          background: #2B8BDE; color: #fff;
          box-shadow: 0 0 0 3px rgba(43,139,222,0.15);
          animation: pulse-blue 2s ease-in-out infinite;
        }
        .clt2-lvl.next .clt2-lvl-label { color: #1E6FB8; font-weight: 700; }

        @keyframes pulse-blue {
          0%, 100% { box-shadow: 0 0 0 3px rgba(43,139,222,0.15); }
          50% { box-shadow: 0 0 0 6px rgba(43,139,222,0.08); }
        }

        .clt2-lvl.locked .clt2-lvl-num {
          background: #f1f5f9; color: #cbd5e1;
        }
        .clt2-lvl.locked { cursor: default; }

        .clt2-lvl:not(.locked):hover { background: rgba(43,139,222,0.03); }
        .clt2-lvl.done:hover { background: rgba(34,197,94,0.03); cursor: default; }

        .clt2-lvl-date {
          font-size: 9px; color: #cbd5e1; margin-top: 2px;
        }

        .clt2-feedback {
          padding: 8px 20px; font-size: 12px; font-weight: 500;
          border-top: 1px solid #f1f5f9;
        }
        .clt2-feedback.ok { background: rgba(34,197,94,0.04); color: #15803d; }
        .clt2-feedback.err { background: rgba(220,38,38,0.04); color: #dc2626; }

        .clt-loading { padding: 40px; text-align: center; color: var(--slate); }
        .clt-empty {
          padding: 40px; text-align: center; color: var(--slate);
          background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
        }
      `}</style>

      <div className="clt-head">
        <div>
          <h2>Clients</h2>
          <p>Parcours d&apos;accompagnement — {totalSteps} étapes</p>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            className="pg-search-input"
            placeholder="Rechercher un nom ou un email…"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Rechercher un client"
          />
          {!loading && !error && clients.length > 0 && totalSteps > 0 && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '8px 18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{clients.length}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' }}>Total clients</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{completedSteps}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' }}>Parcours terminés</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#2B8BDE' }}>
                {Math.round(clients.reduce((sum, c) => sum + c.currentLevel, 0) / (clients.length * totalSteps) * 100)}%
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' }}>Progression moy.</div>
            </div>
          </div>
          )}
        </div>
      </div>

      {loading && <div className="clt-loading">Chargement des clients…</div>}

      {!loading && error && (
        <div className="clt-card2">
          <div className="clt2-feedback err">{error}</div>
        </div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="clt-empty">
          Aucun client. Validez des prospects depuis l&apos;onglet «&nbsp;Prospects &amp; clients&nbsp;».
        </div>
      )}

      {!loading && !error && (
        <div className="clt-grid">
          {clients.map((client) => {
            const stepsByLevel = new Map<number, string>()
            for (const s of client.steps) stepsByLevel.set(s.level, s.sentAt)
            const currentLevel = client.currentLevel
            const nextOrder = currentLevel + 1
            const progressPct = totalSteps > 0 ? Math.round((currentLevel / totalSteps) * 100) : 0

            // Couleur avatar basée sur le nom
            const colors = ['#2B8BDE', '#F97316', '#8B5CF6', '#22C55E', '#EC4899', '#14B8A6', '#EAB308']
            const initials = `${client.firstName[0] ?? ''}${client.lastName[0] ?? ''}`.toUpperCase()
            const colorIdx = (client.firstName.charCodeAt(0) + client.lastName.charCodeAt(0)) % colors.length

            return (
              <div className="clt-card2" key={client.id}>
                {/* Header */}
                <div className="clt2-header">
                  <div className="clt2-h-left">
                    <div className="clt2-avatar" style={{ background: colors[colorIdx] }}>
                      {initials}
                    </div>
                    <div>
                      <div className="clt2-name">{client.firstName} {client.lastName}</div>
                      <div className="clt2-sub">
                        {client.email ?? '—'}{client.phone ? ` · ${client.phone}` : ''}
                        {client.city ? ` · ${client.city}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="clt2-progress-ring">
                    <span className="clt2-progress-num">{currentLevel}<span style={{ fontSize: 12, color: '#94a3b8' }}>/{totalSteps}</span></span>
                    <span className="clt2-progress-label">étapes</span>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Supprimer ce client"
                    onClick={() => setDeleteTarget({ id: client.id, name: `${client.firstName} ${client.lastName}` })}
                    style={{ color: 'var(--red, #dc2626)', padding: '4px 8px', marginLeft: 8 }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>

                {/* Body : tags + progress bar */}
                <div className="clt2-body">
                  <div className="clt2-tags">
                    <span className="clt2-tag type">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                      {client.loanType}
                    </span>
                    <span className="clt2-tag amount">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      {formatEuro(client.amount)}
                    </span>
                    {client.monthlyPayment != null && (
                      <span className="clt2-tag monthly">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {formatEuro(client.monthlyPayment)}/mois
                      </span>
                    )}
                    <span
                      className="clt2-tag"
                      style={{
                        background: client.assignedToName ? '#E6F1FB' : 'rgba(245, 158, 11, 0.14)',
                        color: client.assignedToName ? 'var(--blue-dark, #1e40af)' : 'var(--amber, #d97706)',
                      }}
                      title={client.assignedToName ? `Assigné à ${client.assignedToName}${client.assignedToRole === 'admin' ? ' (super-admin)' : client.assignedToRole === 'advisor' ? ' (conseiller)' : ''}` : 'Aucun conseiller assigné — SMTP système utilisé'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {client.assignedToName ?? 'Non assigné'}
                    </span>
                  </div>
                  <div className="clt2-bar-wrap">
                    <div className="clt2-bar-track">
                      <div className="clt2-bar-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Timeline des étapes */}
                <div className="clt2-levels" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
                  {pipelineSteps.map((step) => {
                    const sentAt = stepsByLevel.get(step.order)
                    const isDone = !!sentAt
                    const isNext = step.order === nextOrder && !isDone
                    const isLocked = step.order > nextOrder

                    if (isDone) {
                      return (
                        <div className="clt2-lvl done" key={step.id} title={`${step.name} — envoyé le ${formatDate(sentAt)}`}>
                          <div className="clt2-lvl-num">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          <div className="clt2-lvl-label">{step.name}</div>
                          <div className="clt2-lvl-date">{formatDate(sentAt)}</div>
                        </div>
                      )
                    }

                    if (isLocked) {
                      return (
                        <div className="clt2-lvl locked" key={step.id} title={step.name}>
                          <div className="clt2-lvl-num">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          </div>
                          <div className="clt2-lvl-label">{step.name}</div>
                        </div>
                      )
                    }

                    return (
                      <button
                        type="button"
                        className={`clt2-lvl${isNext ? ' next' : ''}`}
                        key={step.id}
                        onClick={() => setSendTarget({ client, step })}
                        disabled={sending && sendTarget?.client.id === client.id && sendTarget?.step.id === step.id}
                        title={step.name}
                        style={{ all: 'unset', cursor: 'pointer' }}
                      >
                        <div className="clt2-lvl-num">{step.order}</div>
                        <div className="clt2-lvl-label">{step.name}</div>
                        {isNext && <div className="clt2-lvl-date" style={{ color: '#2B8BDE', fontWeight: 600 }}>Cliquer →</div>}
                      </button>
                    )
                  })}
                </div>

                {/* Feedback */}
                {feedback[client.id] && (
                  <div className={`clt2-feedback ${feedback[client.id].type}`}>
                    {feedback[client.id].type === 'ok' ? '✓ ' : '✗ '}
                    {feedback[client.id].msg}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Pagination
        page={pagination?.page ?? 1}
        totalPages={pagination?.totalPages ?? 1}
        total={pagination?.total}
        loading={loading}
        onChange={setPage}
      />

      <ConfirmDialog
        isOpen={!!sendTarget}
        variant="info"
        title={`Envoyer « ${sendTarget?.step.name ?? ''} » ?`}
        message={
          <>
            Voulez-vous envoyer l&apos;étape <strong>{sendTarget?.step.name}</strong>{' '}
            à <strong>{sendTarget?.client.firstName} {sendTarget?.client.lastName}</strong>&nbsp;?
            <br />
            Un email sera envoyé à <strong>{sendTarget?.client.email ?? '—'}</strong>
            {sendTarget?.step.template ? (
              <> via le modèle <strong>{sendTarget.step.template.name}</strong></>
            ) : null}
            {sendTarget?.step.document ? (
              <> avec le document <strong>{sendTarget.step.document.name}</strong> en pièce jointe.</>
            ) : '.'}
          </>
        }
        confirmLabel={sending ? 'Envoi…' : 'Envoyer'}
        onConfirm={handleSend}
        onClose={() => { if (!sending) setSendTarget(null) }}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer ce client"
        message={<>Supprimer définitivement <strong>{deleteTarget?.name}</strong> ? Toutes les données associées (emails, accompagnement, historique) seront effacées. Cette action est irréversible.</>}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              const res = await fetch(`/api/leads/${deleteTarget.id}`, { method: 'DELETE' })
              if (res.ok) {
                setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id))
                setDeleteTarget(null)
              }
            } catch { /* ignore */ }
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  )
}
