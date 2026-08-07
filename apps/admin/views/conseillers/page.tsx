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

const LOAN_TYPE_FALLBACK = [
  { code: 'immo', label: 'immo' }, { code: 'conso', label: 'conso' },
  { code: 'rachat', label: 'rachat' }, { code: 'pro', label: 'pro' }, { code: 'autre', label: 'autre' },
]
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

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function getLoadColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0
  if (pct >= 0.8) return '#dc2626'
  if (pct >= 0.5) return '#f97316'
  return '#2B8BDE'
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
  const [loanTypes, setLoanTypes] = useState<{ code: string; label: string }[]>(LOAN_TYPE_FALLBACK)

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

  // DEC-K5 — Types de prêt dynamiques depuis la DB.
  useEffect(() => {
    fetch('/api/loan-types', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => setLoanTypes((json.data ?? []).map((t: { code: string; label: string }) => ({ code: t.code, label: t.label }))))
      .catch(() => {})
  }, [])

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

      <div className="info-band">
        <div className="imark">i</div>
        <div>
          Les conseillers reçoivent automatiquement les prospects correspondant à leurs <b>spécialités</b> (types de prêt) et <b>pays</b>.
          Le système assigne au conseiller le <b>moins chargé</b>. Une liste vide signifie « accepte tout ».
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Comptes ({list.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Nouveau conseiller</button>
        </div>
        <div className="panel-body">
          {list.length === 0 ? (
            <div className="card-grid-empty">Aucun compte. Créez votre premier conseiller.</div>
          ) : (
            <div className="cns-card-grid">
              {list.map((u) => {
                const loadPct = u.maxActiveLeads > 0 ? Math.min(100, (u.currentActiveLeads / u.maxActiveLeads) * 100) : 0
                const loadColor = getLoadColor(u.currentActiveLeads, u.maxActiveLeads)
                return (
                  <div key={u.id} className={`cns-card${!u.isActive ? ' cns-card-inactive' : ''}`}>
                    {/* En-tête : avatar + identité */}
                    <div className="cns-card-top">
                      <div className="cns-avatar" style={{ background: u.role === 'admin' ? '#0F2942' : 'var(--blue, #2B8BDE)' }}>
                        {makeInitials(u.displayName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <strong>{u.displayName}</strong>
                          <span className={`role-badge role-${u.role}`}>
                            {u.role === 'admin' ? 'Super-admin' : 'Conseiller'}
                          </span>
                          {!u.isActive && <span style={{ fontSize: 11, color: '#999' }}>· Inactif</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{u.email}</div>
                        {u.phone && <div style={{ fontSize: 12, color: '#aaa' }}>{u.phone}</div>}
                      </div>
                    </div>

                    {/* Barre de charge */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#666' }}>Charge active</span>
                        <span style={{ fontWeight: 600, color: loadColor }}>
                          {u.currentActiveLeads} / {u.maxActiveLeads}
                          {u.currentActiveLeads >= u.maxActiveLeads && ' ⚠'}
                        </span>
                      </div>
                      <div className="cns-load-bar">
                        <div className="cns-load-fill" style={{ width: `${loadPct}%`, background: loadColor }} />
                      </div>
                    </div>

                    {/* Spécialités */}
                    <div style={{ marginBottom: 8 }}>
                      <div className="cns-label-mini">SPÉCIALITÉS</div>
                      {u.loanTypes.length === 0
                        ? <span className="cns-tag cns-tag-all">Tous types</span>
                        : u.loanTypes.map((t) => <span key={t} className="cns-tag">{t}</span>)}
                    </div>

                    {/* Pays */}
                    <div style={{ marginBottom: 12 }}>
                      <div className="cns-label-mini">PAYS</div>
                      {u.countries.length === 0
                        ? <span className="cns-tag cns-tag-all">Tous pays</span>
                        : u.countries.map((c) => <span key={c} className="cns-tag">{c}</span>)}
                    </div>

                    {/* Actions */}
                    <div className="cns-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✎ Modifier</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(u)} style={{ color: 'var(--red, #dc2626)', marginLeft: 'auto' }}>Supprimer</button>
                    </div>
                  </div>
                )
              })}
            </div>
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
            {loanTypes.map((t) => (
              <label key={t.code} className="cns-checkbox">
                <input type="checkbox" checked={form.loanTypes.includes(t.code)}
                  onChange={() => toggleArrayValue('loanTypes', t.code)} />
                {t.label}
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
