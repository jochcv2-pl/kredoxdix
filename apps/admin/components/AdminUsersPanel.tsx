'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'

// =============================================================================
// AdminUsersPanel — panneau "Comptes admin" pour la vue Settings.
// =============================================================================
// CRUD multi-admin via /api/admin/users :
//   - Lister (GET)
//   - Créer (POST) avec email/displayName/password/role
//   - Activer/désactiver (PATCH isActive)
//   - Changer le rôle (PATCH role)
//   - Réinitialiser le mot de passe (PATCH password)
//   - Supprimer (DELETE) avec garde-fous (self/last-admin)
// =============================================================================

type Role = 'admin' | 'advisor' | 'viewer'

interface AdminUser {
  id: string
  email: string
  displayName: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrateur',
  advisor: 'Conseiller',
  viewer: 'Lecture seule',
}

const ROLE_BADGE: Record<Role, string> = {
  admin: 'role-admin',
  advisor: 'role-advisor',
  viewer: 'role-viewer',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  // Form states
  const [createEmail, setCreateEmail] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPass, setCreatePass] = useState('')
  const [createRole, setCreateRole] = useState<Role>('advisor')
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [createLoading, setCreateLoading] = useState(false)

  const [resetPass, setResetPass] = useState('')
  const [resetErr, setResetErr] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/users', { cache: 'no-store' })
      if (!r.ok) throw new Error('Erreur de chargement')
      const json = await r.json()
      setUsers(json.data ?? [])
    } catch {
      setError('Impossible de charger la liste des comptes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ---- Create ----
  const submitCreate = async () => {
    setCreateErr(null)
    setCreateLoading(true)
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createEmail,
          displayName: createName,
          password: createPass,
          role: createRole,
        }),
      })
      const json = await r.json()
      if (!r.ok) {
        const msg = json.code === 'EMAIL_TAKEN' ? 'Cet email est déjà utilisé.'
          : json.code === 'VALIDATION_ERROR' ? 'Données invalides (email, mot de passe min 8 caractères).'
          : json.error ?? 'Erreur inconnue'
        throw new Error(msg)
      }
      setCreateOpen(false)
      setCreateEmail('')
      setCreateName('')
      setCreatePass('')
      setCreateRole('advisor')
      await load()
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setCreateLoading(false)
    }
  }

  // ---- PATCH helper ----
  const patchUser = async (id: string, patch: Record<string, unknown>) => {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j.error ?? 'Erreur lors de la mise à jour')
    }
    return r.json()
  }

  const toggleActive = async (u: AdminUser) => {
    try {
      await patchUser(u.id, { isActive: !u.isActive })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const changeRole = async (u: AdminUser, role: Role) => {
    if (u.role === role) return
    try {
      await patchUser(u.id, { role })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const submitReset = async () => {
    if (!resetTarget) return
    setResetErr(null)
    setResetLoading(true)
    try {
      await patchUser(resetTarget.id, { password: resetPass })
      setResetTarget(null)
      setResetPass('')
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setResetLoading(false)
    }
  }

  const submitDelete = async () => {
    if (!deleteTarget) return
    try {
      const r = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' })
      if (!r.ok && r.status !== 204) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'Erreur')
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Comptes administrateurs</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>+ Nouveau compte</button>
      </div>
      <div className="panel-body" style={{ paddingTop: '14px' }}>
        <p className="field-hint">
          Gérez les comptes ayant accès à ce CRM. Chaque compte a un rôle (Administrateur, Conseiller, Lecture seule).
          Vous ne pouvez pas supprimer votre propre compte ni désactiver le dernier administrateur actif.
        </p>

        {error && (
          <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 12 }}>
            <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
            <div>{error}</div>
          </div>
        )}

        {loading ? (
          <p className="field-hint">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="field-hint">Aucun compte.</p>
        ) : (
          <div className="admin-users-table">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={!u.isActive ? 'row-disabled' : ''}>
                    <td><b>{u.displayName}</b></td>
                    <td><code>{u.email}</code></td>
                    <td>
                      <span className={`role-badge ${ROLE_BADGE[u.role]}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                      <select
                        className="role-select"
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        style={{ marginLeft: 8 }}
                      >
                        <option value="admin">Administrateur</option>
                        <option value="advisor">Conseiller</option>
                        <option value="viewer">Lecture seule</option>
                      </select>
                    </td>
                    <td>
                      <span className={`status-dot ${u.isActive ? 'on' : 'off'}`}></span>
                      {u.isActive ? 'Actif' : 'Désactivé'}
                    </td>
                    <td>{formatDate(u.lastLoginAt)}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <button className="link-btn" title="Activer/Désactiver" onClick={() => toggleActive(u)}>
                        <Icon name="check-circle" size={16} />
                      </button>
                      <button className="link-btn" title="Réinitialiser le mot de passe" onClick={() => { setResetTarget(u); setResetPass(''); setResetErr(null) }}>
                        <Icon name="key" size={16} />
                      </button>
                      <button className="link-btn danger" title="Supprimer" onClick={() => setDeleteTarget(u)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau compte administrateur">
        {createErr && (
          <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 12 }}>
            <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
            <div>{createErr}</div>
          </div>
        )}
        <div className="modal-fg">
          <label>Nom affiché</label>
          <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Ex : Sophie Conseillère" />
        </div>
        <div className="modal-fg">
          <label>Adresse email</label>
          <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="sophie@kredix.local" />
        </div>
        <div className="modal-fg">
          <label>Mot de passe (min. 8 caractères)</label>
          <input type="password" value={createPass} onChange={(e) => setCreatePass(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="modal-fg">
          <label>Rôle</label>
          <select value={createRole} onChange={(e) => setCreateRole(e.target.value as Role)}>
            <option value="admin">Administrateur — accès complet</option>
            <option value="advisor">Conseiller — gère ses leads</option>
            <option value="viewer">Lecture seule — reporting</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Annuler</button>
          <button className="btn btn-primary" disabled={createLoading || !createEmail || !createName || createPass.length < 8} onClick={submitCreate}>
            {createLoading ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title={`Réinitialiser — ${resetTarget?.displayName ?? ''}`}>
        {resetErr && (
          <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 12 }}>
            <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
            <div>{resetErr}</div>
          </div>
        )}
        <p className="field-hint">
          Définissez un nouveau mot de passe temporaire pour <b>{resetTarget?.email}</b>.
          L&apos;utilisateur devra se connecter avec ce mot de passe.
        </p>
        <div className="modal-fg">
          <label>Nouveau mot de passe (min. 8 caractères)</label>
          <input type="password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} placeholder="••••••••" autoFocus />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setResetTarget(null)}>Annuler</button>
          <button className="btn btn-primary" disabled={resetLoading || resetPass.length < 8} onClick={submitReset}>
            {resetLoading ? 'Réinitialisation…' : 'Réinitialiser'}
          </button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Supprimer le compte"
        message={`Voulez-vous vraiment supprimer le compte de ${deleteTarget?.displayName ?? ''} (${deleteTarget?.email ?? ''}) ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={submitDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Local styles */}
      <style jsx>{`
        .admin-users-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .admin-users-table th,
        .admin-users-table td {
          text-align: left;
          padding: 10px 8px;
          border-bottom: 1px solid var(--line-soft, #e5e7eb);
          vertical-align: middle;
        }
        .admin-users-table th {
          font-weight: 600;
          font-size: 12px;
          color: var(--text-soft, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .row-disabled td {
          opacity: 0.55;
        }
        .role-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .role-admin { background: #ede9fe; color: #6d28d9; }
        .role-advisor { background: #dbeafe; color: #1d4ed8; }
        .role-viewer { background: #f3f4f6; color: #4b5563; }
        .role-select {
          padding: 3px 6px;
          font-size: 12px;
          border: 1px solid var(--line-soft, #e5e7eb);
          border-radius: 4px;
          background: white;
        }
        .status-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 6px;
          vertical-align: middle;
        }
        .status-dot.on { background: #10b981; }
        .status-dot.off { background: #ef4444; }
        .link-btn {
          background: none;
          border: none;
          padding: 4px 6px;
          cursor: pointer;
          color: var(--text-soft, #6b7280);
          border-radius: 4px;
        }
        .link-btn:hover { background: var(--bg-soft, #f3f4f6); color: var(--text, #111); }
        .link-btn.danger:hover { background: #fef2f2; color: #b91c1c; }
        .btn-sm { padding: 6px 10px; font-size: 12px; }
      `}</style>
    </div>
  )
}
