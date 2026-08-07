'use client'

// =============================================================================
// Vue Journal d'audit — Phase 7 Bloc F.
// =============================================================================
// Affiche l'historique des actions admin (mutations + sécurité).
// Super-admin only (route /api/audit-logs en requireAdmin + menu filtré).

import { useEffect, useState, useCallback } from 'react'
import { Search, Shield, Clock, User, Database, Activity } from 'lucide-react'

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

// Badge couleur par action.
function actionBadgeClass(action: string): string {
  if (action === 'create') return 'badge badge-success'
  if (action === 'delete') return 'badge badge-danger'
  if (action === 'update' || action === 'password_change' || action === 'session_revoke') return 'badge badge-warning'
  if (action === 'send') return 'badge badge-info'
  return 'badge'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
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
      if (search) params.set('search', search)
      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) throw new Error('Échec chargement')
      const json = await res.json()
      setLogs(json.data)
      setPagination(json.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [entityFilter, actionFilter, search, page])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  return (
    <div className="view audit-view">
      <header className="view-header">
        <div>
          <h1>
            <Shield size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Journal d&apos;audit
          </h1>
          <p className="view-subtitle">
            Historique des actions admin — mutations, sécurité, envois. {pagination ? `(${pagination.total} entrées)` : ''}
          </p>
        </div>
      </header>

      {/* Filtres */}
      <div className="audit-filters" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }} className="input">
          <option value="">Toutes entités</option>
          {ENTITY_OPTIONS.filter(Boolean).map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1) }} className="input">
          <option value="">Toutes actions</option>
          {ACTION_OPTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Rechercher par entityId…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="input"
          style={{ flex: '1 1 200px' }}
        />
        <button onClick={() => void fetchLogs()} className="btn btn-secondary">
          <Search size={14} style={{ marginRight: 6 }} />
          Rafraîchir
        </button>
      </div>

      {/* États */}
      {loading && <div className="state state-loading">Chargement du journal…</div>}
      {error && <div className="state state-error">Erreur : {error}</div>}
      {!loading && !error && logs.length === 0 && (
        <div className="state state-empty">
          <Activity size={32} />
          <p>Aucune entrée d&apos;audit pour ces filtres.</p>
        </div>
      )}

      {/* Tableau */}
      {!loading && !error && logs.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th><Clock size={12} style={{ marginRight: 4 }} />Date</th>
                  <th><User size={12} style={{ marginRight: 4 }} />Auteur</th>
                  <th>Action</th>
                  <th><Database size={12} style={{ marginRight: 4 }} />Entité</th>
                  <th>Entity ID</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                      {formatDate(log.createdAt)}
                    </td>
                    <td>
                      {log.admin ? (
                        <span title={log.admin.email}>
                          {log.admin.displayName}
                          <span className="muted" style={{ marginLeft: 6 }}>
                            ({log.admin.role})
                          </span>
                        </span>
                      ) : (
                        <span className="muted">système</span>
                      )}
                    </td>
                    <td>
                      <span className={actionBadgeClass(log.action)}>{log.action}</span>
                    </td>
                    <td><code>{log.entity}</code></td>
                    <td>
                      {log.entityId ? (
                        <code style={{ fontSize: 11 }} title={log.entityId}>
                          {log.entityId.length > 12 ? `${log.entityId.slice(0, 12)}…` : log.entityId}
                        </code>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <code style={{ fontSize: 10, color: '#666' }}>
                          {JSON.stringify(log.metadata).slice(0, 80)}
                          {JSON.stringify(log.metadata).length > 80 ? '…' : ''}
                        </code>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="pagination" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Précédent
              </button>
              <span className="pagination-info" style={{ alignSelf: 'center' }}>
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
