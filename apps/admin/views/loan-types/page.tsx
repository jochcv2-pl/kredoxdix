'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Vue "Types de prêt" — CRUD (super-admin only).
// Les types créés ici s'affichent automatiquement dans le formulaire du site
// web et dans le routing des conseillers (checkboxes loanTypes).
// =============================================================================

interface LoanType {
  id: string
  code: string
  label: string
  isActive: boolean
  sortOrder: number
}

interface FormState {
  code: string
  label: string
  isActive: boolean
  sortOrder: number
}

const EMPTY_FORM: FormState = {
  code: '', label: '', isActive: true, sortOrder: 0,
}

export default function LoanTypes() {
  const [list, setList] = useState<LoanType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<LoanType | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<LoanType | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/loan-types', { cache: 'no-store' })
      if (!res.ok) throw new Error('Chargement échoué')
      const json = await res.json()
      setList(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, sortOrder: list.length + 1 })
    setEditing(null); setCreating(true); setError(null)
  }

  const openEdit = (t: LoanType) => {
    setForm({ code: t.code, label: t.label, isActive: t.isActive, sortOrder: t.sortOrder })
    setEditing(t); setCreating(true); setError(null)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.label.trim()) { setError('Code et libellé requis'); return }
    setSaving(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      }
      if (!editing) body.code = form.code.trim().toLowerCase()

      const url = editing ? `/api/loan-types/${editing.id}` : '/api/loan-types'
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
      const res = await fetch(`/api/loan-types/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Suppression échouée')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setSaving(false) }
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
          Ces types s&apos;affichent automatiquement dans le <b>formulaire du site web</b> et dans le <b>routing des conseillers</b>.
          Désactivez un type pour le masquer sans le supprimer.
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Types de prêt ({list.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Nouveau type</button>
        </div>
        <div className="panel-body">
          {list.length === 0 ? (
            <div className="card-grid-empty">Aucun type. Créez votre premier type de prêt.</div>
          ) : (
            <div className="cns-card-grid">
              {list.map((t) => (
                <div key={t.id} className={`cns-card${!t.isActive ? ' cns-card-inactive' : ''}`}>
                  <div className="cns-card-top">
                    <div className="cns-avatar" style={{ background: t.isActive ? 'var(--blue, #2B8BDE)' : '#ccc', fontSize: 13 }}>
                      {t.sortOrder}
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong>{t.label}</strong>
                      <div style={{ fontSize: 12, color: '#888' }}>code : <code>{t.code}</code></div>
                    </div>
                    {t.isActive
                      ? <span style={{ fontSize: 11, color: 'var(--green, #16a34a)' }}>● Actif</span>
                      : <span style={{ fontSize: 11, color: '#999' }}>● Inactif</span>}
                  </div>
                  <div className="cns-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>✎ Modifier</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(t)} style={{ color: 'var(--red, #dc2626)', marginLeft: 'auto' }}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={creating}
        onClose={() => { setCreating(false); setEditing(null); setError(null) }}
        title={editing ? `Modifier ${editing.label}` : 'Nouveau type de prêt'}
      >
        <div className="modal-fg">
          <label>Code technique *</label>
          <input
            type="text" value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="ex : voiture, travaux, etudiant"
            disabled={!!editing}
            autoFocus
          />
          <div className="field-hint">
            Clé en minuscules sans espaces. Utilisée dans le routing et les emails. Non modifiable après création.
          </div>

          <label>Libellé affiché *</label>
          <input
            type="text" value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="ex : Crédit voiture, Travaux, Étudiant"
          />

          <label>Ordre d&apos;affichage</label>
          <input
            type="number" min={0} max={999} value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Type actif (affiché dans le formulaire du site)
          </label>

          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setEditing(null); setError(null) }}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Sauvegarde…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer le type"
        message={<>Supprimer <strong>{deleteTarget?.label}</strong> ? Les leads existants avec ce type ne sont pas affectés, mais le type n&apos;apparaîtra plus dans les formulaires.</>}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
