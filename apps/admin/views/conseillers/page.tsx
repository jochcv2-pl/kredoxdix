'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Vue "Gestion des conseillers" (DEC-K5 multi-admin).
// Super-admin only : créer, configurer (routing + identité), activer/désactiver.
// =============================================================================

interface AdminUser {
  id: string
  email: string
  displayName: string
  role: string
  isActive: boolean
  firstName: string | null
  lastName: string | null
  phone: string | null
  loanTypes: string[]
  countries: string[]
  maxActiveLeads: number
  currentActiveLeads: number
  lastAssignedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

const LOAN_TYPES = ['immo', 'conso', 'rachat', 'pro', 'autre']
const COUNTRIES = ['FR', 'BE', 'CH', 'DE', 'LU', 'MC', 'ES', 'PT', 'IT']

interface FormState {
  email: string
  password: string
  displayName: string
  firstName: string
  lastName: string
  phone: string
  role: 'admin' | 'advisor'
  loanTypes: string[]
  countries: string[]
  maxActiveLeads: number
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  email: '', password: '', displayName: '', firstName: '', lastName: '',
  phone: '', role: 'advisor', loanTypes: [], countries: [], maxActiveLeads: 50, isActive: true,
}

export default function Conseillers() {
  const [list, setList] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      if (!res.ok) throw new Error('Chargement échoué')
      const json = await res.json()
      setList(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm(EMPTY_FORM); setEditing(null); setCreating(true); setError(null)
  }

  const openEdit = (u: AdminUser) => {
    setForm({
      email: u.email, password: '', displayName: u.displayName,
      firstName: u.firstName ?? '', lastName: u.lastName ?? '', phone: u.phone ?? '',
      role: (u.role === 'admin' ? 'admin' : 'advisor'),
      loanTypes: u.loanTypes, countries: u.countries,
      maxActiveLeads: u.maxActiveLeads, isActive: u.isActive,
    })
    setEditing(u); setCreating(true); setError(null)
  }

  const handleSave = async () => {
    if (!form.email.trim() || !form.displayName.trim()) return
    if (!editing && form.password.length < 8) { setError('Mot de passe : 8 caractères minimum'); return }
    setSaving(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        email: form.email.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role,
        loanTypes: form.loanTypes,
        countries: form.countries,
        maxActiveLeads: form.maxActiveLeads,
        isActive: form.isActive,
      }
      if (!editing) body.password = form.password
      if (editing && form.password) body.password = form.password

      const url = editing ? `/api/admin/users/${editing.id}` : '/api/admin/users'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Sauvegarde échouée')
      }
      setCreating(false); setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Suppression échouée')
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setSaving(false) }
  }

  const toggleArrayValue = (key: 'loanTypes' | 'countries', value: string) => {
    setForm((prev) => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
    })
  }

  if (loading) return <div className="loading-state">Chargement…</div>

  return (
    <div className="view-content">
      {error && !creating && (
        <div className="alert alert-error" style={{ cursor: 'pointer' }} onClick={() => setError(null)}>{error}</div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Comptes conseillers ({list.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Nouveau conseiller</button>
        </div>
        <div className="panel-body">
          {list.length === 0 ? (
            <div className="card-grid-empty">Aucun compte. Créez votre premier conseiller.</div>
          ) : (
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Charge</th>
                  <th>Spécialités</th>
                  <th>Pays</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.displayName}</strong>
                      {(u.firstName || u.lastName) && (
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>
                        {u.role === 'admin' ? 'Super-admin' : u.role === 'advisor' ? 'Conseiller' : u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`status-dot ${u.isActive ? 'on' : 'off'}`}></span>
                      {u.isActive ? 'Actif' : 'Inactif'}
                    </td>
                    <td>
                      {u.currentActiveLeads}/{u.maxActiveLeads}
                      {u.currentActiveLeads >= u.maxActiveLeads && (
                        <span style={{ color: 'var(--red)', marginLeft: 4 }} title="Saturé">●</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {u.loanTypes.length === 0
                        ? <span style={{ color: '#888' }}>Tous</span>
                        : u.loanTypes.join(', ')}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {u.countries.length === 0
                        ? <span style={{ color: '#888' }}>Tous</span>
                        : u.countries.join(', ')}
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => openEdit(u)}>Modifier</button>
                      {' · '}
                      <button className="link-btn" onClick={() => setDeleteTarget(u)} style={{ color: 'var(--red)' }}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal création / édition */}
      <Modal
        isOpen={creating}
        onClose={() => { setCreating(false); setEditing(null); setError(null) }}
        title={editing ? `Modifier ${editing.displayName}` : 'Nouveau conseiller'}
        wide
      >
        <div className="modal-fg">
          <label>Email *</label>
          <input type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="conseiller@kredix.fr" autoFocus />

          <label>Mot de passe {editing ? '(laisser vide pour ne pas changer)' : '*'}</label>
          <input type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="8 caractères minimum" />

          <label>Nom d&apos;affichage *</label>
          <input type="text" value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Jean Dupont" />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Prénom <span style={{ color: '#aaa' }}>(variables email)</span></label>
              <input type="text" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Jean" />
            </div>
            <div style={{ flex: 1 }}>
              <label>Nom <span style={{ color: '#aaa' }}>(variables email)</span></label>
              <input type="text" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Dupont" />
            </div>
          </div>

          <label>Téléphone <span style={{ color: '#aaa' }}>(variables email)</span></label>
          <input type="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+33 6 12 34 56 78" />

          <label>Rôle</label>
          <select value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'advisor' })}>
            <option value="advisor">Conseiller (voit ses leads uniquement)</option>
            <option value="admin">Super-admin (voit tout, gère les comptes)</option>
          </select>

          <label>Spécialités — types de prêt <span style={{ color: '#aaa' }}>(vide = tous)</span></label>
          <div className="cns-checkbox-group">
            {LOAN_TYPES.map((t) => (
              <label key={t} className="cns-checkbox">
                <input type="checkbox" checked={form.loanTypes.includes(t)}
                  onChange={() => toggleArrayValue('loanTypes', t)} />
                {t}
              </label>
            ))}
          </div>

          <label>Pays desservis <span style={{ color: '#aaa' }}>(vide = tous)</span></label>
          <div className="cns-checkbox-group">
            {COUNTRIES.map((c) => (
              <label key={c} className="cns-checkbox">
                <input type="checkbox" checked={form.countries.includes(c)}
                  onChange={() => toggleArrayValue('countries', c)} />
                {c}
              </label>
            ))}
          </div>

          <label>Capacité max (leads actifs simultanés)</label>
          <input type="number" min={1} max={500} value={form.maxActiveLeads}
            onChange={(e) => setForm({ ...form, maxActiveLeads: Number(e.target.value) || 50 })} />

          <label className="cns-checkbox" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Compte actif
          </label>

          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setEditing(null); setError(null) }}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Sauvegarde…' : editing ? 'Enregistrer' : 'Créer le conseiller'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation suppression */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer le compte"
        message={`Supprimer définitivement le compte de ${deleteTarget?.displayName} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
