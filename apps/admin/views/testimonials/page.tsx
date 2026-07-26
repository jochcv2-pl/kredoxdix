'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'

// =============================================================================
// Testimonials — CRUD des témoignages clients affichés sur la landing publique.
// =============================================================================

interface Testimonial {
  id: string
  authorName: string
  authorRole: string | null
  authorLocation: string | null
  rating: number
  content: string
  locale: string
  isVisible: boolean
  order: number
}

interface FormState {
  authorName: string
  authorRole: string
  authorLocation: string
  rating: number
  content: string
  locale: string
  isVisible: boolean
  order: number
}

const EMPTY: FormState = {
  authorName: '', authorRole: '', authorLocation: '',
  rating: 5, content: '', locale: 'de', isVisible: true, order: 0,
}

const LOCALES = ['de', 'fr', 'en', 'es', 'pt', 'it']

export default function Testimonials() {
  const [list, setList] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterLocale, setFilterLocale] = useState('de')
  const [editing, setEditing] = useState<Testimonial | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<Testimonial | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/testimonials?locale=${filterLocale}`)
      if (!res.ok) throw new Error('Chargement échoué')
      const json = await res.json()
      setList(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [filterLocale])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY, locale: filterLocale })
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (t: Testimonial) => {
    setForm({
      authorName: t.authorName,
      authorRole: t.authorRole ?? '',
      authorLocation: t.authorLocation ?? '',
      rating: t.rating,
      content: t.content,
      locale: t.locale,
      isVisible: t.isVisible,
      order: t.order,
    })
    setEditing(t)
    setCreating(true)
  }

  const handleSave = async () => {
    if (!form.authorName.trim() || !form.content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editing ? `/api/testimonials/${editing.id}` : '/api/testimonials'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: form.authorName.trim(),
          authorRole: form.authorRole.trim() || null,
          authorLocation: form.authorLocation.trim() || null,
          rating: form.rating,
          content: form.content.trim(),
          locale: form.locale,
          isVisible: form.isVisible,
          order: form.order,
        }),
      })
      if (!res.ok) throw new Error('Sauvegarde échouée')
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
      const res = await fetch(`/api/testimonials/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Suppression échouée')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const toggleVisible = async (t: Testimonial) => {
    try {
      await fetch(`/api/testimonials/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: !t.isVisible }),
      })
      await load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="view-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="locale-filter" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Langue :</span>
          {LOCALES.map((lc) => (
            <button
              key={lc}
              className={`btn btn-sm ${filterLocale === lc ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterLocale(lc)}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              {lc.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Icon name="user-plus" size={16} /> Nouvel avis
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : list.length === 0 ? (
        <div className="card-grid-empty">
          Aucun témoignage en <b>{filterLocale.toUpperCase()}</b>. Cliquez sur « Nouvel avis ».
        </div>
      ) : (
        <div className="card-grid">
          {list.map((t) => (
            <div key={t.id} className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">{t.authorName}</div>
                  {t.authorRole && <div className="card-meta">{t.authorRole}{t.authorLocation ? ` · ${t.authorLocation}` : ''}</div>}
                </div>
                <span style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} name="star" size={14} style={{ color: i < t.rating ? '#f59e0b' : '#e5e7eb' }} />
                  ))}
                </span>
              </div>
              <p className="card-body">
                « {t.content.length > 140 ? t.content.slice(0, 140) + '…' : t.content} »
              </p>
              <div className="card-actions">
                <span className={`badge ${t.isVisible ? 'b-client' : 'b-lost'}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                  {t.isVisible ? 'Visible' : 'Masqué'}
                </span>
                <span className="badge b-offer" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                  {t.locale.toUpperCase()} · #{t.order}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleVisible(t)} title={t.isVisible ? 'Masquer' : 'Afficher'}>
                    <Icon name={t.isVisible ? 'check-circle' : 'x'} size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)} title="Modifier">
                    <Icon name="pencil" size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(t)} title="Supprimer" style={{ color: '#ef4444' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title={editing ? 'Modifier l\'avis' : 'Nouvel avis client'}>
        <div className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="form-field">
            <span className="form-label">Nom de l'auteur *</span>
            <input
              type="text"
              value={form.authorName}
              onChange={(e) => setForm({ ...form, authorName: e.target.value })}
              placeholder="Ex : Thomas Müller"
              className="form-input"
            />
          </label>
          <div style={{ display: 'flex', gap: 14 }}>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Rôle / profession</span>
              <input
                type="text"
                value={form.authorRole}
                onChange={(e) => setForm({ ...form, authorRole: e.target.value })}
                placeholder="Ex : Ingénieur"
                className="form-input"
              />
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Ville</span>
              <input
                type="text"
                value={form.authorLocation}
                onChange={(e) => setForm({ ...form, authorLocation: e.target.value })}
                placeholder="Ex : Munich"
                className="form-input"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Note (1-5)</span>
              <select
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                className="form-input"
              >
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} étoile{n > 1 ? 's' : ''} ({n}/5)</option>)}
              </select>
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Langue</span>
              <select
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                className="form-input"
              >
                {LOCALES.map((lc) => <option key={lc} value={lc}>{lc.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="form-field" style={{ width: 100 }}>
              <span className="form-label">Ordre</span>
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                className="form-input"
              />
            </label>
          </div>
          <label className="form-field">
            <span className="form-label">Témoignage *</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="« Kredix m'a permis d'obtenir un crédit à un taux imbattable… »"
              rows={5}
              className="form-input"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
            />
            <span style={{ fontSize: 14 }}>Afficher sur le site public</span>
          </label>
          <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.authorName.trim() || !form.content.trim()}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer cet avis"
        message={`Supprimer définitivement le témoignage de « ${deleteTarget?.authorName ?? ''} » ?`}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
