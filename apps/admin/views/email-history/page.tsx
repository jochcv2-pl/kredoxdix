'use client'

import { useEffect, useState } from 'react'

interface EmailLog {
  id: string
  leadId: string | null
  email: string
  trigger: string
  templateName: string
  subject: string
  campaignId: string | null
  status: string
  error: string | null
  sentAt: string
  gatewayId: string | null
  gatewayLabel: string | null
  fromEmail: string | null
}

const TRIGGER_LABELS: Record<string, { label: string; cls: string }> = {
  accueil_ack: { label: 'Accusé de réception', cls: 'b-progress' },
  offer:       { label: 'Offre de prêt',       cls: 'b-offer' },
  relance_1:   { label: 'Relance J+3',         cls: 'b-wait' },
  relance_2:   { label: 'Relance J+6',         cls: 'b-wait' },
  relance_3:   { label: 'Relance J+9',         cls: 'b-lost' },
  campaign:    { label: 'Campagne',            cls: 'b-contact' },
  manual:      { label: 'Manuel',              cls: 'b-new' },
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  sent:    { label: 'Envoyé',    cls: 'b-client' },
  failed:  { label: 'Échec',     cls: 'b-lost' },
  skipped: { label: 'Ignoré',    cls: 'b-wait' },
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

export default function EmailHistory() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [emailFilter, setEmailFilter] = useState('')
  const [triggerFilter, setTriggerFilter] = useState<string>('all')

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (emailFilter.trim()) params.set('email', emailFilter.trim())
      if (triggerFilter !== 'all') params.set('trigger', triggerFilter)
      const qs = params.toString()
      const url = `/api/email-logs${qs ? `?${qs}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setLogs(Array.isArray(json?.data) ? json.data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerFilter])

  const triggerOptions = Object.entries(TRIGGER_LABELS)

  return (
    <section className="view" id="email-history">
      <style>{`
        .eh-toolbar {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          flex-wrap: wrap;
          margin-bottom: 16px;
          background: var(--bg, #f8fafc);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
          padding: 16px 18px;
        }
        .eh-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .eh-field label {
          font-size: 11px;
          font-weight: 700;
          color: var(--slate, #64748b);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .eh-field input,
        .eh-field select {
          min-width: 220px;
          padding: 8px 12px;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          background: var(--white, #fff);
          font-size: 14px;
          color: var(--ink, #1e293b);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .eh-field input:focus,
        .eh-field select:focus {
          outline: none;
          border-color: var(--blue, #2B8BDE);
          box-shadow: 0 0 0 3px rgba(43, 139, 222, 0.12);
        }
        .eh-toolbar .btn { height: 38px; }
        .eh-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--slate);
          font-size: 13px;
          margin-left: auto;
        }
        .eh-count {
          font-weight: 600;
          color: var(--ink);
        }
        .eh-loading {
          padding: 40px;
          text-align: center;
          color: var(--slate);
        }
        .eh-error {
          padding: 16px;
          color: var(--danger, #c0392b);
          background: rgba(192, 57, 43, 0.08);
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .eh-empty {
          padding: 48px 16px;
          text-align: center;
          color: var(--slate-light);
          font-size: 14px;
        }
        .eh-subject {
          max-width: 380px;
          color: var(--ink);
        }
        .eh-template {
          font-size: 12px;
          color: var(--slate);
        }
        .eh-smtp {
          white-space: nowrap;
        }
        .eh-smtp .badge {
          font-size: 11px;
        }
        .eh-smtp .muted {
          color: var(--slate-light, #cbd5e1);
          font-size: 12px;
        }
        .eh-err {
          display: block;
          font-size: 11px;
          color: var(--danger, #c0392b);
          margin-top: 2px;
        }
        #email-history .table-wrap {
          overflow-x: auto;
        }
        #email-history table {
          width: 100%;
          border-collapse: collapse;
        }
        #email-history table th {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--slate, #64748b);
          padding: 10px 14px;
          border-bottom: 2px solid var(--border, #e5e7eb);
        }
        #email-history table td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border, #f1f5f9);
          font-size: 13px;
        }
        #email-history table tbody tr:hover {
          background: var(--bg, #f8fafc);
        }
      `}</style>

      <div className="info-band">
        <div className="imark">i</div>
        <div>
          Historique complet des emails envoyés par les agents IA et les campagnes :
          accusés de réception, offres de prêt, séquence de relance (J+3 · J+6 · J+9)
          et envois en masse. Chaque tentative (envoyée, échouée ou ignorée) est journalisée.
        </div>
      </div>

      <div className="eh-toolbar">
        <div className="eh-field">
          <label htmlFor="eh-email">Rechercher par email</label>
          <input
            id="eh-email"
            type="email"
            placeholder="prospect@email.fr"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchLogs()
            }}
          />
        </div>

        <div className="eh-field">
          <label htmlFor="eh-trigger">Type d&apos;email</label>
          <select
            id="eh-trigger"
            value={triggerFilter}
            onChange={(e) => setTriggerFilter(e.target.value)}
          >
            <option value="all">Tous les types</option>
            {triggerOptions.map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" onClick={fetchLogs}>
          Actualiser
        </button>

        <div className="eh-meta">
          {loading ? (
            <span>Chargement…</span>
          ) : (
            <span>
              <span className="eh-count">{logs.length}</span> email(s) affiché(s)
            </span>
          )}
        </div>
      </div>

      {error && <div className="eh-error">Erreur lors du chargement : {error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h3>Historique des emails</h3>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="eh-loading">Chargement de l&apos;historique…</div>
          ) : logs.length === 0 ? (
            <div className="eh-empty">Aucun email à afficher pour ces critères.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date / heure</th>
                    <th>Prospect</th>
                    <th>Type</th>
                    <th>Modèle</th>
                    <th>SMTP</th>
                    <th>Objet</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const trigCfg = TRIGGER_LABELS[log.trigger] ?? {
                      label: log.trigger,
                      cls: 'b-new',
                    }
                    const statusCfg = STATUS_CONFIG[log.status] ?? {
                      label: log.status,
                      cls: 'b-wait',
                    }
                    return (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.sentAt)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{log.email}</td>
                        <td>
                          <span className={`badge ${trigCfg.cls}`}>
                            <span className="badge-dot"></span>
                            {trigCfg.label}
                          </span>
                        </td>
                        <td className="eh-template">{log.templateName || '—'}</td>
                        <td className="eh-smtp">
                          {log.gatewayLabel ? (
                            <span
                              className="badge b-contacted"
                              title={log.fromEmail ? `From : ${log.fromEmail}` : 'From non renseigné'}
                            >
                              <span className="badge-dot"></span>
                              {log.gatewayLabel}
                            </span>
                          ) : (
                            <span className="muted" title="Envoi antérieur à la traçabilité SMTP (avant le 2026-08-08)">
                              —
                            </span>
                          )}
                        </td>
                        <td className="eh-subject">
                          {truncate(log.subject, 80)}
                          {log.error && log.status === 'failed' && (
                            <span className="eh-err">{log.error}</span>
                          )}
                          {log.error && log.status === 'skipped' && (
                            <span className="eh-err">{log.error}</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${statusCfg.cls}`}>
                            <span className="badge-dot"></span>
                            {statusCfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
