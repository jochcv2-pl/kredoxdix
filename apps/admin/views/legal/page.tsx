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
        <style>{`
          .lg-field { display: flex; flex-direction: column; gap: 6px; }
          .lg-label {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.05em; color: #64748b;
          }
          .lg-input {
            padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 10px;
            font-size: 14px; color: #1e293b; background: #fff; width: 100%;
            outline: none; transition: border-color 0.15s, box-shadow 0.15s;
            font-family: inherit; box-sizing: border-box;
          }
          .lg-input:focus {
            border-color: #2B8BDE; box-shadow: 0 0 0 3px rgba(43,139,222,0.1);
          }
          .lg-input::placeholder { color: #cbd5e1; }
          .lg-suggestion {
            padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 500;
            cursor: pointer; border: 1px solid #e5e7eb; background: #fff;
            transition: all 0.15s; color: #475569;
          }
          .lg-suggestion:hover {
            border-color: #2B8BDE; background: rgba(43,139,222,0.04); color: #2B8BDE;
          }
          .lg-toggle {
            display: flex; align-items: center; gap: 10px; cursor: pointer;
            padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 10px;
            background: #f8fafc; transition: background 0.15s;
          }
          .lg-toggle:hover { background: #f1f5f9; }
          .lg-toggle input { width: 18px; height: 18px; cursor: pointer; }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Header contextuel */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(43,139,222,0.04)', border: '1px solid rgba(43,139,222,0.1)',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(43,139,222,0.15), rgba(43,139,222,0.05))',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Icon name="file-text" size={20} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                {editing ? form.title || 'Page sans titre' : 'Nouvelle page légale'}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                URL : /legal/<b style={{ color: '#64748b' }}>{form.slug || 'slug'}</b>
              </div>
            </div>
          </div>

          {/* Suggestions rapides (uniquement en création) */}
          {!editing && (
            <div>
              <span className="lg-label" style={{ marginBottom: 8, display: 'block' }}>
                Modèles rapides
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SLUG_SUGGESTIONS.map((s) => (
                  <button
                    key={s.slug}
                    className="lg-suggestion"
                    onClick={() => applySuggestion(s.slug, s.cat)}
                    style={form.slug === s.slug ? { borderColor: '#2B8BDE', background: 'rgba(43,139,222,0.06)', color: '#2B8BDE' } : {}}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ligne : Slug + Langue + Catégorie + Ordre */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="lg-field" style={{ flex: '2 1 180px' }}>
              <label className="lg-label">Slug (URL) *</label>
              <input
                type="text"
                className="lg-input"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="impressum"
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
            <div className="lg-field" style={{ flex: '1 1 120px' }}>
              <label className="lg-label">Langue</label>
              <select
                className="lg-input"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                style={{ cursor: 'pointer' }}
              >
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
              </select>
            </div>
            <div className="lg-field" style={{ flex: '1 1 120px' }}>
              <label className="lg-label">Catégorie</label>
              <select
                className="lg-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ cursor: 'pointer' }}
              >
                <option value="legal">legal</option>
                <option value="terms">terms</option>
                <option value="privacy">privacy</option>
                <option value="cookies">cookies</option>
              </select>
            </div>
            <div className="lg-field" style={{ width: 80, flexShrink: 0 }}>
              <label className="lg-label">Ordre</label>
              <input
                type="number"
                className="lg-input"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                style={{ textAlign: 'center' }}
              />
            </div>
          </div>

          {/* Titre */}
          <div className="lg-field">
            <label className="lg-label">Titre *</label>
            <input
              type="text"
              className="lg-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Impressum"
              style={{ fontSize: 15, fontWeight: 600 }}
            />
          </div>

          {/* Contenu */}
          <div className="lg-field">
            <label className="lg-label">
              Contenu *
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#94a3b8' }}>
                (Markdown ou texte brut)
              </span>
            </label>
            <textarea
              className="lg-input"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={'# Impressum\n\nAngaben gemäß § 5 TMG:\n\nKredix GmbH...'}
              rows={14}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7 }}
            />
          </div>

          {/* Toggle actif */}
          <label className="lg-toggle">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Afficher dans le footer</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>La page sera visible publiquement sur le site</div>
            </div>
          </label>

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
            marginTop: 4, paddingTop: 16, borderTop: '1px solid #f1f5f9',
          }}>
            <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
              {editing ? `Dernière modification : ${new Date(editing.updatedAt).toLocaleDateString('fr-FR')}` : ''}
            </span>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.slug.trim() || !form.title.trim() || !form.content.trim()}
              style={{ padding: '10px 24px', borderRadius: 10, fontWeight: 700 }}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer la page'}
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
