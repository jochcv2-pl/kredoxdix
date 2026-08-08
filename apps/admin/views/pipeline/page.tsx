'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, Mail, AlertTriangle, CheckCircle, XCircle, SkipForward } from 'lucide-react'

// =============================================================================
// PipelineView — Observabilité du pipeline de relance email.
// Read-only + bouton pause d'urgence. Auto-refresh 30s.
// =============================================================================

interface PipelineState {
  paused: boolean
  providerName: string | null
  providersCount: number
  dailyCap: number
  sentToday: number
  queue: {
    relance1: number
    relance2: number
    relance3: number
    totalDue: number
    scheduled: number
    totalActive: number
    nearTimeout: number
  }
  upcomingLeads: Array<{
    id: string
    initials: string
    name: string
    email: string
    relanceCount: number
    nextRelanceAt: string | null
    createdAt: string
  }>
  recentLogs: Array<{
    id: string
    email: string
    trigger: string
    templateName: string
    subject: string
    status: string
    error: string | null
    sentAt: string
    leadId: string | null
  }>
  stats: {
    totalSent: number
    totalFailed: number
    totalSkipped: number
  }
  activeCampaigns: Array<{
    id: string
    name: string
    status: string
    templateName: string
    totalRecipients: number
    sentCount: number
    failedCount: number
    pendingCount: number
    startedAt: string | null
  }>
}

const TRIGGER_LABELS: Record<string, string> = {
  reception_ack: 'Accusé de réception',
  relance_1: '1ʳᵉ relance',
  relance_2: '2ᵉ relance',
  relance_3: '3ᵉ relance',
  offer: 'Offre',
  campaign: 'Campagne',
  manual: 'Manuel',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof CheckCircle }> = {
  sent:    { label: 'Envoyé',  cls: 'b-client', icon: CheckCircle },
  failed:  { label: 'Échec',   cls: 'b-lost',   icon: XCircle },
  skipped: { label: 'Ignoré',  cls: 'b-wait',   icon: SkipForward },
  bounce:  { label: 'Rebond',  cls: 'b-lost',   icon: AlertTriangle },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `il y a ${hrs} h`
  const days = Math.floor(hrs / 24)
  return `il y a ${days} j`
}

export default function PipelineView() {
  const [state, setState] = useState<PipelineState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pipeline/state', { cache: 'no-store' })
      if (!res.ok) throw new Error('Échec du chargement')
      const body = await res.json()
      setState(body.data)
      setError('')
    } catch {
      setError('Impossible de charger l\'état du pipeline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  const togglePause = async () => {
    if (!state) return
    setToggling(true)
    try {
      const res = await fetch('/api/admin/pipeline/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !state.paused }),
      })
      if (!res.ok) throw new Error('Échec')
      const body = await res.json()
      setState(prev => prev ? { ...prev, paused: body.data.paused } : prev)
    } catch {
      setError('Impossible de basculer la pause')
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return <div className="loading-state">Chargement du pipeline…</div>
  }

  if (!state && error) {
    return <div className="alert alert-error">{error}</div>
  }

  if (!state) return null

  const quotaPct = state.dailyCap > 0 ? Math.min(100, Math.round((state.sentToday / state.dailyCap) * 100)) : 0
  const quotaDanger = quotaPct >= 90

  return (
    <section className="view" id="pipeline">
      {/* ===== En-tête : État + Pause ===== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        background: 'var(--white, #fff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 14,
        padding: '18px 22px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Left: Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: state.paused ? 'var(--amber, #f59e0b)' : '#22c55e',
            boxShadow: state.paused
              ? '0 0 0 4px rgba(245,158,11,0.12)'
              : '0 0 0 4px rgba(34,197,94,0.12)',
            flexShrink: 0,
            animation: state.paused ? 'none' : 'pipeline-pulse 2s ease-in-out infinite',
          }} />
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Pipeline de relance
            </h2>
            <p style={{ fontSize: 12, color: 'var(--slate, #64748b)', margin: '3px 0 0' }}>
              {state.paused ? (
                <span style={{ color: 'var(--amber, #d97706)', fontWeight: 600 }}>
                  ⏸ En pause — reprise au prochain cycle (≤ 60s)
                </span>
              ) : (
                <>Actif · SMTP système : <b>{state.providerName || 'Aucun'}</b> · {state.providersCount ?? '?'} SMTP actif{(state.providersCount ?? 0) > 1 ? 's' : ''} · Auto-refresh 30s</>
              )}
            </p>
          </div>
        </div>

        {/* Right: Pause/Resume toggle button */}
        <button
          onClick={togglePause}
          disabled={toggling}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: toggling ? 'wait' : 'pointer',
            border: 'none',
            transition: 'all 0.2s ease',
            background: state.paused
              ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            color: '#fff',
            boxShadow: state.paused
              ? '0 4px 12px rgba(34,197,94,0.25)'
              : '0 4px 12px rgba(249,115,22,0.25)',
            opacity: toggling ? 0.6 : 1,
          }}
        >
          {toggling ? (
            <div style={{
              width: 16, height: 16,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'pipeline-spin 0.6s linear infinite',
            }} />
          ) : state.paused ? (
            <Play size={16} fill="currentColor" strokeWidth={0} />
          ) : (
            <Pause size={16} fill="currentColor" strokeWidth={0} />
          )}
          {state.paused ? 'Reprendre' : 'Mettre en pause'}
        </button>
      </div>

      <style>{`
        @keyframes pipeline-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(34,197,94,0.12); }
          50% { box-shadow: 0 0 0 7px rgba(34,197,94,0.06); }
        }
        @keyframes pipeline-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ===== KPIs ===== */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Envoyés aujourd'hui</div>
          <div className="kpi-value">{state.sentToday}<span style={{ fontSize: 14, color: '#9ca3af' }}> / {state.dailyCap}</span></div>
          <div className="pipeline-quota-bar">
            <div
              className={`pipeline-quota-fill ${quotaDanger ? 'danger' : ''}`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dûs maintenant</div>
          <div className="kpi-value" style={{ color: state.queue.totalDue > 0 ? 'var(--blue)' : undefined }}>{state.queue.totalDue}</div>
          <div className="kpi-sub">En attente d'envoi</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Programmés</div>
          <div className="kpi-value">{state.queue.scheduled}</div>
          <div className="kpi-sub">Pas encore échus</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total actifs</div>
          <div className="kpi-value">{state.queue.totalActive}</div>
          <div className="kpi-sub">Dans la séquence</div>
        </div>
      </div>

      {/* ===== Layout 2 colonnes ===== */}
      <div className="pipeline-cols">
        {/* Colonne gauche — File d'attente */}
        <div className="panel">
          <div className="panel-head">
            <h3>File d'attente par étape</h3>
            {state.queue.nearTimeout > 0 && (
              <span className="badge b-wait" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={12} /> {state.queue.nearTimeout} proche timeout
              </span>
            )}
          </div>
          <div className="panel-body">
            {/* Étapes */}
            <div className="pipeline-steps">
              <div className="pipeline-step">
                <div className="pipeline-step-icon" style={{ background: 'var(--blue)' }}>
                  <Mail size={16} />
                </div>
                <div className="pipeline-step-info">
                  <div className="pipeline-step-name">Accusé de réception</div>
                  <div className="pipeline-step-desc">Envoyé immédiatement à la soumission</div>
                </div>
                <div className="pipeline-step-count">—</div>
              </div>

              <div className="pipeline-step">
                <div className="pipeline-step-num">1</div>
                <div className="pipeline-step-info">
                  <div className="pipeline-step-name">1ʳᵉ relance (J+3)</div>
                  <div className="pipeline-step-desc">Relance personnalisée IA</div>
                </div>
                <div className={`pipeline-step-count ${state.queue.relance1 > 0 ? 'due' : ''}`}>{state.queue.relance1}</div>
              </div>

              <div className="pipeline-step">
                <div className="pipeline-step-num">2</div>
                <div className="pipeline-step-info">
                  <div className="pipeline-step-name">2ᵉ relance (J+6)</div>
                  <div className="pipeline-step-desc">Angle différent, urgence modérée</div>
                </div>
                <div className={`pipeline-step-count ${state.queue.relance2 > 0 ? 'due' : ''}`}>{state.queue.relance2}</div>
              </div>

              <div className="pipeline-step">
                <div className="pipeline-step-num">3</div>
                <div className="pipeline-step-info">
                  <div className="pipeline-step-name">3ᵉ relance (J+9)</div>
                  <div className="pipeline-step-desc">Dernière chance → clôture</div>
                </div>
                <div className={`pipeline-step-count ${state.queue.relance3 > 0 ? 'due' : ''}`}>{state.queue.relance3}</div>
              </div>
            </div>

            {/* Prochains leads */}
            {state.upcomingLeads.length > 0 && (
              <>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 10, color: '#374151' }}>
                  Prochains à relancer
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {state.upcomingLeads.map((lead) => (
                    <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <div className="pipeline-avatar">{lead.initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{lead.name}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{lead.email}</div>
                      </div>
                      <span className="badge b-offer" style={{ fontSize: 11 }}>Relance {lead.relanceCount + 1}/3</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(lead.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Stats globales */}
            <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                <CheckCircle size={14} style={{ display: 'inline', color: 'var(--green)', marginRight: 4 }} />
                {state.stats.totalSent} envoyés au total
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                <XCircle size={14} style={{ display: 'inline', color: 'var(--red)', marginRight: 4 }} />
                {state.stats.totalFailed} échecs
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                <SkipForward size={14} style={{ display: 'inline', color: 'var(--amber)', marginRight: 4 }} />
                {state.stats.totalSkipped} ignorés
              </div>
            </div>
          </div>
        </div>

        {/* Colonne droite — Envois récents */}
        <div className="panel">
          <div className="panel-head">
            <h3>Envois récents</h3>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>30 derniers</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {state.recentLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>
                <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div>Aucun envoi pour le moment</div>
              </div>
            ) : (
              <div className="pipeline-logs">
                {state.recentLogs.map((log) => {
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.sent
                  const Icon = cfg.icon
                  return (
                    <div key={log.id} className="pipeline-log-row">
                      <div className={`pipeline-log-icon ${log.status}`}>
                        <Icon size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.subject}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {log.email} · {TRIGGER_LABELS[log.trigger] || log.trigger}
                        </div>
                        {log.status === 'failed' && log.error && (
                          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
                            {log.error.slice(0, 100)}
                          </div>
                        )}
                      </div>
                      <span className={`badge ${cfg.cls}`} style={{ fontSize: 10, flexShrink: 0 }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, width: 60, textAlign: 'right' }}>
                        {timeAgo(log.sentAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section pleine largeur — Campagnes actives */}
      {state.activeCampaigns && state.activeCampaigns.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h3>Campagnes actives</h3>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {state.activeCampaigns.length} campagne{state.activeCampaigns.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Campagne</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Statut</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Envoyés</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>En attente</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Échecs</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Progression</th>
                </tr>
              </thead>
              <tbody>
                {state.activeCampaigns.map((camp) => {
                  const pct = camp.totalRecipients > 0
                    ? Math.round((camp.sentCount / camp.totalRecipients) * 100)
                    : 0
                  return (
                    <tr key={camp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>
                        <b>{camp.name}</b>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{camp.templateName}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge ${camp.status === 'sending' ? 'b-progress' : 'b-wait'}`} style={{ fontSize: 10 }}>
                          {camp.status === 'sending' ? 'Envoi en cours' : 'Brouillon'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#16a34a' }}>{camp.sentCount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>{camp.pendingCount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: camp.failedCount > 0 ? '#ef4444' : '#9ca3af' }}>{camp.failedCount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: '#6b7280' }}>{camp.totalRecipients}</td>
                      <td style={{ padding: '10px 14px', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: camp.status === 'sending' ? '#3b82f6' : '#9ca3af', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#6b7280', width: 32 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
