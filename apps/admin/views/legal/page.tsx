'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'

// =============================================================================
// Legal — CRUD des pages légales (Impressum, Datenschutz, CGV, mentions…).
// Ces pages apparaissent dynamiquement dans le footer du site public.
// =============================================================================

interface LegalPage {
  id: string
  slug: string
  locale: string
  title: string
  category: string
  content: string
  order: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface FormState {
  slug: string
  locale: string
  title: string
  category: string
  content: string
  order: number
  isActive: boolean
}

const EMPTY: FormState = {
  slug: '', locale: 'de', title: '', category: 'legal', content: '', order: 0, isActive: true,
}

// Suggestions de slugs légaux courants (DE/FR).
const SLUG_SUGGESTIONS = [
  { slug: 'impressum', label: 'Impressum (Mentions légales DE)', cat: 'legal' },
  { slug: 'datenschutz', label: 'Datenschutz (Confidentialité DE)', cat: 'legal' },
  { slug: 'agb', label: 'AGB (CGV DE)', cat: 'terms' },
  { slug: 'cookie-richtlinie', label: 'Cookie-Richtlinie (Cookies)', cat: 'legal' },
  { slug: 'mentions-legales', label: 'Mentions légales (FR)', cat: 'legal' },
  { slug: 'politique-confidentialite', label: 'Politique de confidentialité (FR)', cat: 'legal' },
  { slug: 'cgv', label: 'CGV (FR)', cat: 'terms' },
]

export default function Legal() {
  const [list, setList] = useState<LegalPage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<LegalPage | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<LegalPage | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/legal-pages')
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
    setForm({ ...EMPTY })
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (p: LegalPage) => {
    setForm({
      slug: p.slug,
      locale: p.locale,
      title: p.title,
      category: p.category,
      content: p.content,
      order: p.order,
      isActive: p.isActive,
    })
    setEditing(p)
    setCreating(true)
  }

  const applySuggestion = (slug: string, cat: string) => {
    setForm({ ...form, slug, category: cat })
  }

  const handleSave = async () => {
    if (!form.slug.trim() || !form.title.trim() || !form.content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editing ? `/api/legal-pages/${editing.id}` : '/api/legal-pages'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug.trim(),
          title: form.title.trim(),
          category: form.category.trim() || 'legal',
          content: form.content,
          order: form.order,
          isActive: form.isActive,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Sauvegarde échouée')
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
      await fetch(`/api/legal-pages/${id}`, { method: 'DELETE' })
      await load()
    } catch { /* ignore */ }
  }

  const toggleActive = async (p: LegalPage) => {
    try {
      await fetch(`/api/legal-pages/${p.id}`, {
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
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {list.filter(p => p.isActive).length} page(s) active(s) sur {list.length}
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + Nouvelle page
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
          Aucune page légale. Cliquez sur « Nouvelle page ».
        </div>
      ) : (
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>Slug</th>
              <th style={{ padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>Titre</th>
              <th style={{ padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>Catégorie</th>
              <th style={{ padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>Ordre</th>
              <th style={{ padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280' }}>Statut</th>
              <th style={{ padding: '10px 8px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px 8px' }}>
                  <code style={{ fontSize: 13, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
                    /{p.slug}
                  </code>
                </td>
                <td style={{ padding: '12px 8px', fontSize: 14, fontWeight: 600 }}>{p.title}</td>
                <td style={{ padding: '12px 8px', fontSize: 13, color: '#6b7280' }}>{p.category}</td>
                <td style={{ padding: '12px 8px', fontSize: 13 }}>{p.order}</td>
                <td style={{ padding: '12px 8px' }}>
                  <span className={`badge ${p.isActive ? 'b-client' : 'b-lost'}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)} title={p.isActive ? 'Désactiver' : 'Activer'}>
                    <Icon name={p.isActive ? 'check-circle' : 'x'} size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Modifier">✏️</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(p)} title="Supprimer" style={{ color: '#ef4444' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title={editing ? 'Modifier la page' : 'Nouvelle page légale'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Suggestions rapides (uniquement en création) */}
          {!editing && (
            <div>
              <span className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                Modèles rapides :
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SLUG_SUGGESTIONS.map((s) => (
                  <button
                    key={s.slug}
                    className="btn btn-ghost btn-sm"
                    onClick={() => applySuggestion(s.slug, s.cat)}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 14 }}>
            <label className="form-field" style={{ flex: 2 }}>
              <span className="form-label">Slug (URL) *</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="impressum"
                className="form-input"
              />
              <small style={{ color: '#9ca3af', fontSize: 12 }}>Apparaît comme : /legal/<b>{form.slug || 'slug'}</b></small>
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Langue</span>
              <select
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                className="form-input"
              >
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
              </select>
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Catégorie</span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="form-input"
              />
            </label>
            <label className="form-field" style={{ width: 90 }}>
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
            <span className="form-label">Titre *</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Impressum"
              className="form-input"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Contenu * <small style={{ fontWeight: 400, color: '#9ca3af' }}>(Markdown ou texte brut)</small></span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="# Impressum&#10;&#10;Angaben gemäß § 5 TMG:&#10;&#10;Kredix GmbH..."
              rows={14}
              className="form-input"
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span style={{ fontSize: 14 }}>Afficher dans le footer du site</span>
          </label>

          <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.slug.trim() || !form.title.trim() || !form.content.trim()}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer cette page"
        message={`Supprimer définitivement « ${deleteTarget?.title ?? ''} » (${deleteTarget?.slug ?? ''}) ?`}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
