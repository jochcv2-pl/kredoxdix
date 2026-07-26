'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'

// =============================================================================
// Partners — CRUD des banques partenaires affichées sur la landing publique.
// Logo (URL), nom, slug, ordre d'affichage, statut actif.
// =============================================================================

interface BankPartner {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  isActive: boolean
  displayOrder: number
  _count?: { rates: number }
}

interface FormState {
  name: string
  slug: string
  logoUrl: string
  contactEmail: string
  contactPhone: string
  isActive: boolean
  displayOrder: number
}

const EMPTY: FormState = {
  name: '', slug: '', logoUrl: '',
  contactEmail: '', contactPhone: '',
  isActive: true, displayOrder: 0,
}

export default function Partners() {
  const [list, setList] = useState<BankPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BankPartner | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<BankPartner | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bank-partners')
      if (!res.ok) throw new Error('Chargement échoué')
      const json = await res.json()
      setList(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY, displayOrder: list.length })
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (p: BankPartner) => {
    setForm({
      name: p.name,
      slug: p.slug,
      logoUrl: p.logoUrl ?? '',
      contactEmail: p.contactEmail ?? '',
      contactPhone: p.contactPhone ?? '',
      isActive: p.isActive,
      displayOrder: p.displayOrder,
    })
    setEditing(p)
    setCreating(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editing ? `/api/bank-partners/${editing.id}` : '/api/bank-partners'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          logoUrl: form.logoUrl.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          isActive: form.isActive,
          displayOrder: form.displayOrder,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error ?? 'Sauvegarde échouée')
      }
      setCreating(false)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/bank-partners/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Suppression échouée')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const toggleActive = async (p: BankPartner) => {
    try {
      await fetch(`/api/bank-partners/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      })
      await load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
          Les logos des banques partenaires défilent sur la page d'accueil du site public.
        </p>
        <button className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" size={16} /> Ajouter une banque
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : list.length === 0 ? (
        <div className="card-grid-empty">
          Aucune banque partenaire. Cliquez sur « Ajouter une banque ».
        </div>
      ) : (
        <div className="card-grid">
          {list.map((p) => (
            <div key={p.id} className="card" style={{ opacity: p.isActive ? 1 : 0.5 }}>
              <div className="card-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {p.logoUrl ? (
                    <img
                      src={p.logoUrl}
                      alt={p.name}
                      style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8, background: '#f8fafc' }}
                    />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 8, background: '#f1f5f9',
                      display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, color: '#64748b',
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="card-title">{p.name}</div>
                    <div className="card-meta">
                      /{p.slug}
                      {p._count && p._count.rates > 0 ? ` · ${p._count.rates} taux` : ''}
                    </div>
                  </div>
                </div>
              </div>
              {(p.contactEmail || p.contactPhone) && (
                <p className="card-body" style={{ fontSize: 12, color: '#94a3b8' }}>
                  {p.contactEmail && <>{p.contactEmail}<br /></>}
                  {p.contactPhone}
                </p>
              )}
              <div className="card-actions">
                <span className={`badge ${p.isActive ? 'b-client' : 'b-lost'}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                  {p.isActive ? 'Actif' : 'Inactif'}
                </span>
                <span className="badge b-offer" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                  Ordre #{p.displayOrder}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)} title={p.isActive ? 'Désactiver' : 'Activer'}>
                    <Icon name={p.isActive ? 'check-circle' : 'x'} size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Modifier">
                    <Icon name="pencil" size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(p)} title="Supprimer" style={{ color: '#ef4444' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title={editing ? 'Modifier la banque' : 'Ajouter une banque'}>
        <div className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="form-field">
            <span className="form-label">Nom de la banque *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex : Sparkasse"
              className="form-input"
              autoFocus
            />
          </label>
          <label className="form-field">
            <span className="form-label">Slug (URL, auto si vide)</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="sparkasse"
              className="form-input"
              style={{ fontFamily: 'monospace' }}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Logo (URL)</span>
            <input
              type="url"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://exemple.com/logo.png"
              className="form-input"
            />
            {form.logoUrl && (
              <div style={{ marginTop: 8, padding: 12, background: '#f8fafc', borderRadius: 8, textAlign: 'center' }}>
                <img src={form.logoUrl} alt="Aperçu logo" style={{ maxHeight: 60, objectFit: 'contain' }} />
              </div>
            )}
          </label>
          <div style={{ display: 'flex', gap: 14 }}>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Email contact</span>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                placeholder="contact@banque.fr"
                className="form-input"
              />
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Téléphone contact</span>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                placeholder="+33 1 23 45 67 89"
                className="form-input"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <label className="form-field" style={{ width: 100 }}>
              <span className="form-label">Ordre d'affichage</span>
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                className="form-input"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 24 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontSize: 14 }}>Afficher sur le site public</span>
            </label>
          </div>
          <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer cette banque"
        message={`Supprimer définitivement « ${deleteTarget?.name ?? ''} » ? Les taux associés ne seront pas supprimés.`}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
