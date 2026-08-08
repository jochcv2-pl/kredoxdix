'use client'

// =============================================================================
// Vue Journal d'audit — Phase 7 Bloc F.
// =============================================================================
// Affiche l'historique des actions admin (mutations + sécurité + envois).
// Super-admin only (route /api/audit-logs en requireAdmin + menu filtré).
//
// Design system Kredix : info-band + kpi-grid + toolbar scoped (.audit-*) +
// panel + badges à dot (b-new / b-wait / b-progress / b-offer / b-client / b-lost).
// Cohérent avec email-history, contacts, dashboard.

import { useCallback, useEffect, useState } from 'react'
import {
  Shield,
  Activity,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  KeyRound,
  ShieldAlert,
  Send,
} from 'lucide-react'

interface AuditLog {
  id: string
  adminId: string | null
  action: string
  entity: string
  entityId: string | null
  diff: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  admin: { id: string; email: string; displayName: string; role: string } | null
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const ENTITY_OPTIONS = ['', 'Lead', 'Campaign', 'AdminUser', 'EmailTemplate', 'Setting', 'EmailGateway']
const ACTION_OPTIONS = ['', 'create', 'update', 'delete', 'login', 'logout', 'password_change', 'session_revoke', 'send']

// Mapping action → libellé FR + classe badge Kredix + icône.
type IconType = typeof Plus
const ACTION_CONFIG: Record<string, { label: string; cls: string; Icon: IconType }> = {
  create:          { label: 'Création',           cls: 'b-client',   Icon: Plus },
  update:          { label: 'Modification',       cls: 'b-wait',     Icon: Pencil },
  delete:          { label: 'Suppression',        cls: 'b-lost',     Icon: Trash2 },
  login:           { label: 'Connexion',          cls: 'b-new',      Icon: LogIn },
  logout:          { label: 'Déconnexion',        cls: 'b-new',      Icon: LogOut },
  password_change: { label: 'Changement mdp',     cls: 'b-progress', Icon: KeyRound },
  session_revoke:  { label: 'Révocation session', cls: 'b-progress', Icon: ShieldAlert },
  send:            { label: 'Envoi email',        cls: 'b-offer',    Icon: Send },
}

function actionConfig(action: string): { label: string; cls: string; Icon: IconType } {
  return ACTION_CONFIG[action] ?? { label: action, cls: 'b-contacted', Icon: Activity }
}

const ENTITY_LABELS: Record<string, string> = {
  Lead: 'Prospect',
  Campaign: 'Campagne',
  AdminUser: 'Conseiller',
  EmailTemplate: 'Modèle email',
  Setting: 'Paramètre',
  EmailGateway: 'Passerelle SMTP',
}

function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity
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
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

function makeInitials(displayName: string): string {
  if (!displayName) return '??'
  const parts = displayName.trim().split(/\s+/)
  const f = parts[0]?.[0] ?? ''
  const l = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (f + l).toUpperCase() || '??'
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function roleLabel(role: string): string {
  if (role === 'admin') return 'super-admin'
  if (role === 'advisor') return 'conseiller'
  if (role === 'viewer') return 'lecteur'
  return role
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtres
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' })
      if (entityFilter) params.set('entity', entityFilter)
      if (actionFilter) params.set('action', actionFilter)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setLogs(json.data ?? [])
      setPagination(json.pagination ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setLogs([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [entityFilter, actionFilter, search, page])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  // Reset filtre → page 1 (évite de rester sur une page inexistante après filtre)
  const resetEntityFilter = (v: string) => { setEntityFilter(v); setPage(1) }
  const resetActionFilter = (v: string) => { setActionFilter(v); setPage(1) }
  const resetSearch = (v: string) => { setSearch(v); setPage(1) }

  const total = pagination?.total ?? null
  const lastActivity = logs.length > 0 ? logs[0].createdAt : null

  return (
    <section className="view" id="audit">
      <style>{`
        #audit .audit-toolbar {
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
        #audit .audit-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        #audit .audit-field label {
          font-size: 11px;
          font-weight: 700;
          color: var(--slate, #64748b);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        #audit .audit-field input,
        #audit .audit-field select {
          min-width: 200px;
          padding: 8px 12px;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          background: var(--white, #fff);
          font-size: 14px;
          color: var(--ink, #1e293b);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        #audit .audit-field input:focus,
        #audit .audit-field select:focus {
          outline: none;
          border-color: var(--blue, #2B8BDE);
          box-shadow: 0 0 0 3px rgba(43, 139, 222, 0.12);
        }
        #audit .audit-toolbar .btn { height: 38px; }
        #audit .audit-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--slate);
          font-size: 13px;
          margin-left: auto;
        }
        #audit .audit-count { font-weight: 600; color: var(--ink); }
        #audit .audit-error {
          padding: 16px;
          color: var(--danger, #c0392b);
          background: rgba(192, 57, 43, 0.08);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        #audit .audit-loading {
          padding: 48px 16px;
          text-align: center;
          color: var(--slate);
          font-size: 14px;
        }
        #audit .audit-empty {
          padding: 56px 16px;
          text-align: center;
          color: var(--slate-light, #94a3b8);
          font-size: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        #audit .audit-empty svg { opacity: 0.4; }
        #audit .table-wrap { overflow-x: auto; }
        #audit table { width: 100%; border-collapse: collapse; }
        #audit table th {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--slate, #64748b);
          padding: 10px 14px;
          border-bottom: 2px solid var(--border, #e5e7eb);
          text-align: left;
          white-space: nowrap;
        }
        #audit table td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border, #f1f5f9);
          font-size: 13px;
          color: var(--ink, #1e293b);
          vertical-align: middle;
        }
        #audit table tbody tr:hover { background: var(--bg, #f8fafc); }
        #audit .audit-date {
          white-space: nowrap;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          color: var(--ink);
        }
        #audit .audit-date small {
          display: block;
          font-family: inherit;
          margin-top: 2px;
        }
        #audit .audit-entity {
          font-size: 12px;
          background: var(--bg, #f1f5f9);
          padding: 3px 8px;
          border-radius: 6px;
          color: var(--ink);
          font-weight: 500;
        }
        #audit .audit-id {
          font-size: 11px;
          color: var(--slate, #64748b);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        #audit .audit-details {
          cursor: pointer;
          font-size: 12px;
          color: var(--blue, #2B8BDE);
        }
        #audit .audit-details summary {
          list-style: none;
          user-select: none;
        }
        #audit .audit-details summary::-webkit-details-marker { display: none; }
        #audit .audit-details summary:hover { text-decoration: underline; }
        #audit .audit-details pre {
          margin-top: 8px;
          background: var(--bg, #0f172a);
          background: #0f172a;
          color: #e2e8f0;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 11px;
          line-height: 1.5;
          max-width: 360px;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        #audit .audit-pagination {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          margin-top: 20px;
        }
        #audit .audit-pagination .btn { min-width: 110px; }
        #audit .audit-pagination-info {
          font-size: 13px;
          color: var(--slate);
          font-weight: 500;
        }
      `}</style>

      <div className="info-band">
        <div className="imark"><Shield size={14} /></div>
        <div>
          <b>Journal d&apos;audit</b> — traçabilité de toutes les actions admin :
          mutations (création / modification / suppression), sécurité (connexions,
          changements de mot de passe, révocations de session) et envois en masse.
          Lecture réservée au super-admin.
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Entrées totales</div>
          <div className="kpi-value">{total !== null ? total.toLocaleString('fr-FR') : '—'}</div>
          <div className="kpi-trend up">depuis l&apos;ouverture du journal</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dernière activité</div>
          <div className="kpi-value">{lastActivity ? timeAgo(lastActivity) : '—'}</div>
          <div className="kpi-trend up">
            {lastActivity ? formatDate(lastActivity) : 'aucune activité'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Auteurs suivis</div>
          <div className="kpi-value">{new Set(logs.map((l) => l.adminId).filter(Boolean)).size || '—'}</div>
          <div className="kpi-trend up">sur la page courante</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Page courante</div>
          <div className="kpi-value">{pagination ? `${pagination.page}/${pagination.totalPages}` : '—'}</div>
          <div className="kpi-trend up">{logs.length} affichées</div>
        </div>
      </div>

      {/* Toolbar filtres */}
      <div className="audit-toolbar">
        <div className="audit-field">
          <label htmlFor="audit-entity">Entité</label>
          <select
            id="audit-entity"
            value={entityFilter}
            onChange={(e) => resetEntityFilter(e.target.value)}
          >
            <option value="">Toutes</option>
            {ENTITY_OPTIONS.filter(Boolean).map((e) => (
              <option key={e} value={e}>{entityLabel(e)}</option>
            ))}
          </select>
        </div>
        <div className="audit-field">
          <label htmlFor="audit-action">Action</label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(e) => resetActionFilter(e.target.value)}
          >
            <option value="">Toutes</option>
            {ACTION_OPTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>{actionConfig(a).label}</option>
            ))}
          </select>
        </div>
        <div className="audit-field">
          <label htmlFor="audit-search">Recherche (entityId)</label>
          <input
            id="audit-search"
            type="text"
            placeholder="ex: ck1234abcd…"
            value={search}
            onChange={(e) => resetSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void fetchLogs() }}
          />
        </div>
        <button className="btn btn-primary" onClick={() => void fetchLogs()}>
          Actualiser
        </button>
        <div className="audit-meta">
          {loading ? (
            <span>Chargement…</span>
          ) : (
            <span>
              <span className="audit-count">{logs.length}</span> sur {total ?? '?'} entrée(s)
            </span>
          )}
        </div>
      </div>

      {error && <div className="audit-error">Erreur lors du chargement : {error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h3>Historique des actions</h3>
          {logs.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--slate)' }}>
              Page {pagination?.page} · {logs.length} entrée(s)
            </span>
          )}
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="audit-loading">Chargement du journal…</div>
          ) : logs.length === 0 ? (
            <div className="audit-empty">
              <Shield size={36} />
              <p>Aucune entrée d&apos;audit pour ces filtres.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Auteur</th>
                    <th>Entité</th>
                    <th>Cible</th>
                    <th>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const cfg = actionConfig(log.action)
                    const Icon = cfg.Icon
                    return (
                      <tr key={log.id}>
                        <td className="audit-date" title={formatDate(log.createdAt)}>
                          <div>{formatDate(log.createdAt)}</div>
                          <small className="muted">{timeAgo(log.createdAt)}</small>
                        </td>
                        <td>
                          <span className={`badge ${cfg.cls}`}>
                            <span className="badge-dot"></span>
                            <Icon size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            {cfg.label}
                          </span>
                        </td>
                        <td>
                          {log.admin ? (
                            <div className="cust">
                              <div className="ini">{makeInitials(log.admin.displayName)}</div>
                              <div>
                                <b>{log.admin.displayName}</b>
                                <small>{roleLabel(log.admin.role)}</small>
                              </div>
                            </div>
                          ) : (
                            <span className="muted">système</span>
                          )}
                        </td>
                        <td>
                          <span className="audit-entity">{entityLabel(log.entity)}</span>
                        </td>
                        <td>
                          {log.entityId ? (
                            <code className="audit-id" title={log.entityId}>
                              {truncate(log.entityId, 14)}
                            </code>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {log.metadata && Object.keys(log.metadata).length > 0 ? (
                            <details className="audit-details">
                              <summary>Voir détails</summary>
                              <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                            </details>
                          ) : log.ipAddress ? (
                            <code className="audit-id" title="Adresse IP">{log.ipAddress}</code>
                          ) : (
                            <span className="muted">—</span>
                          )}
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

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="audit-pagination">
          <button
            className="btn btn-secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Précédent
          </button>
          <span className="audit-pagination-info">
            Page {pagination.page} / {pagination.totalPages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant →
          </button>
        </div>
      )}
    </section>
  )
}
