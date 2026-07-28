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
  authorAvatar: string | null
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
  authorAvatar: string
  rating: number
  content: string
  locale: string
  isVisible: boolean
  order: number
}

const EMPTY: FormState = {
  authorName: '', authorRole: '', authorLocation: '', authorAvatar: '',
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
      authorAvatar: t.authorAvatar ?? '',
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
          authorAvatar: form.authorAvatar.trim() || null,
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
        <div className="tst-modal">
          {/* Aperçu live */}
          <div className="tst-preview">
            <div className="tst-preview-stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon key={i} name="star" size={18} style={{ color: i < form.rating ? '#f59e0b' : '#e5e7eb' }} />
              ))}
            </div>
            <p className="tst-preview-text">
              « {form.content || 'Le témoignage apparaîtra ici…'} »
            </p>
            <div className="tst-preview-author">
              <strong>{form.authorName || 'Nom de l\'auteur'}</strong>
              {form.authorRole && <span> · {form.authorRole}</span>}
              {form.authorLocation && <span> · {form.authorLocation}</span>}
            </div>
          </div>

          {/* Formulaire */}
          <div className="tst-form">
            <div className="tst-row">
              <label className="tst-field">
                <span className="tst-label">Nom de l'auteur *</span>
                <input
                  type="text"
                  value={form.authorName}
                  onChange={(e) => setForm({ ...form, authorName: e.target.value })}
                  placeholder="Ex : Thomas Müller"
                  className="tst-input"
                />
              </label>
            </div>
            <div className="tst-row-2">
              <label className="tst-field">
                <span className="tst-label">Rôle / profession</span>
                <input
                  type="text"
                  value={form.authorRole}
                  onChange={(e) => setForm({ ...form, authorRole: e.target.value })}
                  placeholder="Ex : Ingénieur"
                  className="tst-input"
                />
              </label>
              <label className="tst-field">
                <span className="tst-label">Ville</span>
                <input
                  type="text"
                  value={form.authorLocation}
                  onChange={(e) => setForm({ ...form, authorLocation: e.target.value })}
                  placeholder="Ex : Munich"
                  className="tst-input"
                />
              </label>
            </div>

            {/* Star rating interactif */}
            <div className="tst-rating-row">
              <span className="tst-label">Note</span>
              <div className="tst-stars-pick">
                {[5, 4, 3, 2, 1].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="tst-star-btn"
                    onClick={() => setForm({ ...form, rating: n })}
                    title={`${n} étoile${n > 1 ? 's' : ''}`}
                  >
                    <Icon name="star" size={28} style={{ color: n <= form.rating ? '#f59e0b' : '#e5e7eb' }} />
                  </button>
                ))}
                <span className="tst-rating-val">{form.rating}/5</span>
              </div>
            </div>

            <div className="tst-row-3">
              <label className="tst-field">
                <span className="tst-label">Langue</span>
                <select
                  value={form.locale}
                  onChange={(e) => setForm({ ...form, locale: e.target.value })}
                  className="tst-input"
                >
                  {LOCALES.map((lc) => <option key={lc} value={lc}>{lc.toUpperCase()}</option>)}
                </select>
              </label>
              <label className="tst-field">
                <span className="tst-label">Ordre</span>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                  className="tst-input"
                />
              </label>
              <label className="tst-field">
                <span className="tst-label">Photo (URL)</span>
                <input
                  type="url"
                  value={form.authorAvatar}
                  onChange={(e) => setForm({ ...form, authorAvatar: e.target.value })}
                  placeholder="https://…"
                  className="tst-input"
                />
              </label>
            </div>

            <label className="tst-field">
              <span className="tst-label">Témoignage *</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="« Kredix m'a permis d'obtenir un crédit à un taux imbattable… »"
                rows={4}
                className="tst-input"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>

            <label className="tst-toggle">
              <input
                type="checkbox"
                checked={form.isVisible}
                onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
              />
              <span>Afficher sur le site public</span>
            </label>
          </div>

          <div className="tst-actions">
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.authorName.trim() || !form.content.trim()}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Publier l\'avis'}
            </button>
          </div>

          <style>{`
            .tst-modal { display: flex; flex-direction: column; gap: 16px; }
            .tst-preview {
              background: linear-gradient(135deg, #f8fafc, #f1f5f9);
              border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;
            }
            .tst-preview-stars { display: flex; gap: 2px; margin-bottom: 8px; }
            .tst-preview-text {
              font-size: 14px; line-height: 1.6; color: #475569; font-style: italic;
              margin: 0 0 10px; min-height: 42px;
            }
            .tst-preview-author { font-size: 12px; color: #94a3b8; }
            .tst-preview-author strong { color: #1e293b; font-size: 13px; }

            .tst-form { display: flex; flex-direction: column; gap: 14px; }
            .tst-field { display: flex; flex-direction: column; gap: 5px; flex: 1; }
            .tst-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
            .tst-input {
              padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
              font-size: 14px; color: #1e293b; background: #fff; transition: border-color 0.15s, box-shadow 0.15s;
            }
            .tst-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
            .tst-row-2 { display: flex; gap: 12px; }
            .tst-row-3 { display: flex; gap: 12px; }

            .tst-rating-row { display: flex; align-items: center; gap: 12px; }
            .tst-stars-pick { display: flex; align-items: center; gap: 2px; }
            .tst-star-btn { background: none; border: none; cursor: pointer; padding: 2px; transition: transform 0.1s; }
            .tst-star-btn:hover { transform: scale(1.15); }
            .tst-rating-val { font-size: 13px; font-weight: 700; color: #f59e0b; margin-left: 6px; }

            .tst-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #475569; }
            .tst-toggle input[type=checkbox] { width: 16px; height: 16px; accent-color: #3b82f6; }

            .tst-actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
          `}</style>
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
