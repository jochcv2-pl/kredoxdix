'use client'

import { useCallback, useEffect, useState } from 'react'

type LeadStatus = 'new' | 'contacted' | 'progress' | 'offer' | 'waiting' | 'client' | 'lost'

const STATUS_CONFIG: Record<LeadStatus, { label: string; class: string; color: string }> = {
  new:        { label: 'Nouveau',         class: 'b-new',        color: 'var(--amber)' },
  contacted:  { label: 'Contacté',        class: 'b-contacted',  color: 'var(--blue)' },
  progress:   { label: 'En cours',        class: 'b-progress',   color: 'var(--blue)' },
  offer:      { label: 'Offre envoyée',   class: 'b-offer',      color: '#0EA5E9' },
  waiting:    { label: 'En attente',      class: 'b-wait',       color: 'var(--amber)' },
  client:     { label: 'Clients',         class: 'b-client',     color: 'var(--purple)' },
  lost:       { label: 'Perdu',           class: 'b-lost',       color: 'var(--red)' },
}

const LOAN_TYPE_LABELS: Record<string, string> = {
  immo: 'Immobilier', conso: 'Consommation', rachat: 'Rachat', pro: 'Professionnel', autre: 'Autre',
}

const TRIGGER_LABELS: Record<string, string> = {
  accueil_ack: 'Agent Accueil',
  offer:       'Agent Offre',
  relance_1:   'Agent Relance',
  relance_2:   'Agent Relance',
  relance_3:   'Agent Relance',
  level_1:     'Parcours client',
  level_2:     'Parcours client',
  level_3:     'Parcours client',
  level_4:     'Parcours client',
  level_5:     'Parcours client',
  level_6:     'Parcours client',
  level_7:     'Parcours client',
  campaign:    'Campagne',
  manual:      'Manuel',
}

interface StatsResponse {
  kpis: {
    prospectsActifs: number
    clientsValides: number
    offresFormalisees: number
    volumeFinances: number
    totalLeads: number
  }
  pipeline: { status: LeadStatus; count: number }[]
  derniersLeads: Array<{
    id: string
    firstName: string
    lastName: string
    city: string
    country: string
    loanType: string
    amount: number
    monthlyPayment: number | null
    annualRate: number | null
    durationYears: number
    status: LeadStatus
    createdAt: string
  }>
  activiteAgents: {
    emailsEnvoyesAujourdhui: Record<string, number>
    relancesProgrammees: number
  }
}

interface EmptyStats { empty: true }

function formatEuroCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return (Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1).replace('.', ',')) + ' M€'
  }
  if (n >= 1_000) {
    return Math.round(n / 1000) + ' k€'
  }
  return n + ' €'
}

function formatEuro(n: number): string {
  return n.toLocaleString('fr-FR') + ' €'
}

function makeInitials(firstName: string, lastName: string): string {
  const f = (firstName?.[0] ?? '').toUpperCase()
  const l = (lastName?.[0] ?? '').toUpperCase()
  return (f + l) || '??'
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'à l\'instant'
  if (h === 1) return 'il y a 1h'
  if (h < 24) return `il y a ${h}h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'hier'
  return `il y a ${days}j`
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | EmptyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/leads/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json?.data) {
        setStats(json.data as StatsResponse)
      } else {
        setStats({ empty: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // ---- KPIs ----
  const kpis = stats && !('empty' in stats) ? stats.kpis : null
  const prospectsActifs = kpis?.prospectsActifs ?? 0
  const clientsValides = kpis?.clientsValides ?? 0
  const offresFormalisees = kpis?.offresFormalisees ?? 0
  const volumeFinances = kpis?.volumeFinances ?? 0

  // ---- Pipeline (max pour normaliser les barres à 100%) ----
  const pipelineRows = (stats && !('empty' in stats) ? stats.pipeline : []).filter(
    (p) => p.status !== 'lost',
  )
  const pipelineMax = Math.max(1, ...pipelineRows.map((p) => p.count))

  // ---- Derniers dossiers ----
  const derniers = stats && !('empty' in stats) ? stats.derniersLeads : []

  // ---- Activité agents ----
  const activity = stats && !('empty' in stats) ? stats.activiteAgents : null
  const emailsByTrigger = activity?.emailsEnvoyesAujourdhui ?? {}
  const totalEmailsToday = Object.values(emailsByTrigger).reduce((s, n) => s + n, 0)
  const relancesProgrees = activity?.relancesProgrammees ?? 0

  // Agrège les triggers "relance_*" et "level_*" pour ne pas multiplier les lignes.
  const aggregateAgentActivity = (): { label: string; count: number }[] => {
    const rows: { label: string; count: number }[] = []
    const accueil = emailsByTrigger['accueil_ack'] ?? 0
    const offre = emailsByTrigger['offer'] ?? 0
    const relances = (emailsByTrigger['relance_1'] ?? 0)
      + (emailsByTrigger['relance_2'] ?? 0)
      + (emailsByTrigger['relance_3'] ?? 0)
    const levels = (emailsByTrigger['level_1'] ?? 0)
      + (emailsByTrigger['level_2'] ?? 0)
      + (emailsByTrigger['level_3'] ?? 0)
      + (emailsByTrigger['level_4'] ?? 0)
      + (emailsByTrigger['level_5'] ?? 0)
      + (emailsByTrigger['level_6'] ?? 0)
      + (emailsByTrigger['level_7'] ?? 0)
    const campaign = emailsByTrigger['campaign'] ?? 0

    if (accueil) rows.push({ label: 'Agent Accueil', count: accueil })
    if (offre) rows.push({ label: 'Agent Offre', count: offre })
    if (relances) rows.push({ label: 'Agent Relance', count: relances })
    if (levels) rows.push({ label: 'Parcours client', count: levels })
    if (campaign) rows.push({ label: 'Campagnes', count: campaign })

    return rows
  }

  const agentRows = aggregateAgentActivity()

  if (loading && !stats) {
    return (
      <section className="view active" id="dashboard">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate)' }}>
          Chargement du tableau de bord…
        </div>
      </section>
    )
  }

  return (
    <section className="view active" id="dashboard">
      {error && (
        <div
          style={{
            background: 'rgba(192, 57, 43, 0.08)',
            color: '#c0392b',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}{' '}
          <span className="link" onClick={fetchStats}>Réessayer</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Prospects actifs</div>
          <div className="kpi-value">{prospectsActifs}</div>
          <div className="kpi-trend up">{clientsValides + offresFormalisees} conversion cumulée</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Clients validés</div>
          <div className="kpi-value">{clientsValides}</div>
          <div className="kpi-trend up">par validation admin</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Offres formalisées</div>
          <div className="kpi-value">{offresFormalisees}</div>
          <div className="kpi-trend up">en attente de validation</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Volume financé</div>
          <div className="kpi-value">{formatEuroCompact(volumeFinances)}</div>
          <div className="kpi-trend up">{formatEuro(volumeFinances)} cumulés</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Derniers dossiers</h3>
            {derniers.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--slate)' }}>{derniers.length} récents</span>
            )}
          </div>
          <div className="panel-body">
            {derniers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--slate-light)', fontSize: 14 }}>
                Aucun dossier enregistré pour le moment.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Montant</th>
                    <th>Type</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {derniers.map((d) => {
                    const cfg = STATUS_CONFIG[d.status] ?? { label: d.status, class: 'b-wait', color: 'var(--slate)' }
                    return (
                      <tr key={d.id} className="tr-click">
                        <td>
                          <div className="cust">
                            <div className="ini">{makeInitials(d.firstName, d.lastName)}</div>
                            <div>
                              <b>{d.firstName} {d.lastName}</b>
                              <small>{d.city || '—'} · {timeAgo(d.createdAt)}</small>
                            </div>
                          </div>
                        </td>
                        <td className="amount">{formatEuro(d.amount)}</td>
                        <td>{LOAN_TYPE_LABELS[d.loanType] ?? d.loanType}</td>
                        <td>
                          <span className={`badge ${cfg.class}`}>
                            <span className="badge-dot"></span>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head">
              <h3>Pipeline</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: '16px' }}>
              {pipelineRows.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--slate-light)', fontSize: 14 }}>
                  Aucune donnée de pipeline.
                </div>
              ) : (
                <div className="pipe">
                  {pipelineRows.map((p) => {
                    const cfg = STATUS_CONFIG[p.status] ?? { color: 'var(--slate)' }
                    const widthPct = Math.max(8, Math.round((p.count / pipelineMax) * 100))
                    return (
                      <div className="pipe-row" key={p.status}>
                        <span className="pipe-name">{cfg.label}</span>
                        <div className="pipe-bar">
                          <div className="pipe-fill" style={{ width: `${widthPct}%`, background: cfg.color }} />
                        </div>
                        <span className="pipe-count">{p.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Activité des agents</h3>
              <span style={{ fontSize: 12, color: 'var(--slate)' }}>aujourd&apos;hui</span>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              {agentRows.length === 0 ? (
                <>
                  <div className="set-row">
                    <div className="set-label">
                      <b>Agent Accueil</b>
                      <small>Aucun envoi aujourd&apos;hui</small>
                    </div>
                    <span className="pill-off">Inactif</span>
                  </div>
                  <div className="set-row">
                    <div className="set-label">
                      <b>Agent Relance</b>
                      <small>{relancesProgrees} relance{relancesProgrees > 1 ? 's' : ''} programmée{relancesProgrees > 1 ? 's' : ''}</small>
                    </div>
                    <span className="pill-off">Inactif</span>
                  </div>
                  <div className="set-row">
                    <div className="set-label">
                      <b>Agent Offre</b>
                      <small>Aucun envoi aujourd&apos;hui</small>
                    </div>
                    <span className="pill-off">Inactif</span>
                  </div>
                </>
              ) : (
                agentRows.map((row) => (
                  <div className="set-row" key={row.label}>
                    <div className="set-label">
                      <b>{row.label}</b>
                      <small>{row.count} email{row.count > 1 ? 's' : ''} envoyé{row.count > 1 ? 's' : ''} aujourd&apos;hui</small>
                    </div>
                    <span className="pill-on">Actif</span>
                  </div>
                ))
              )}
              {relancesProgrees > 0 && (
                <div className="set-row">
                  <div className="set-label">
                    <b>Relances programmées</b>
                    <small>En file d&apos;attente cron</small>
                  </div>
                  <span className="set-val">{relancesProgrees}</span>
                </div>
              )}
              <div className="set-row">
                <div className="set-label">
                  <b>Total envois du jour</b>
                  <small>Tous canaux confondus</small>
                </div>
                <span className="set-val">{totalEmailsToday}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Référence conservée pour conserver la map des labels (utilisable plus tard
// si on veut détailler le déclencheur exact d'un envoi).
void TRIGGER_LABELS
