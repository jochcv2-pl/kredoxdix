'use client'

import { useEffect, useState, useCallback } from 'react'
import { Icon } from '@/components/Icon'

// =============================================================================
// Content — Édition des sections CMS ("Nos engagements", "Nos services").
// Chaque section a une entrée par langue. Le contenu est upserté via POST.
// =============================================================================

interface ContentItem {
  icon: string
  title: string
  description: string
}

interface ContentBlock {
  id: string
  section: string
  locale: string
  eyebrow: string | null
  title: string | null
  lead: string | null
  items: ContentItem[]
}

interface FormState {
  eyebrow: string
  title: string
  lead: string
  items: ContentItem[]
}

const SECTIONS = [
  { key: 'engagements', label: 'Nos engagements' },
  { key: 'services', label: 'Nos services' },
] as const

const LOCALES = ['de', 'fr', 'en', 'es', 'pt', 'it']

const ICON_OPTIONS = [
  'shield', 'check', 'check-circle', 'award', 'key', 'phone', 'mail',
  'trending', 'cpu', 'bot', 'user-plus', 'bar-chart', 'download',
]

export default function Content() {
  const [section, setSection] = useState<string>('engagements')
  const [locale, setLocale] = useState('de')
  const [block, setBlock] = useState<ContentBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ eyebrow: '', title: '', lead: '', items: [] })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-blocks?section=${section}&locale=${locale}`)
      const json = await res.json()
      const data: ContentBlock[] = json.data ?? []
      // L'API GET liste tous les blocs de la section; on filtre côté client.
      const found = data.find((b) => b.locale === locale) ?? null
      setBlock(found)
      setForm({
        eyebrow: found?.eyebrow ?? '',
        title: found?.title ?? '',
        lead: found?.lead ?? '',
        items: found?.items ?? [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [section, locale])

  useEffect(() => { load() }, [load])

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { icon: 'check', title: '', description: '' }] })
  }

  const updateItem = (idx: number, field: keyof ContentItem, val: string) => {
    const items = [...form.items]
    items[idx] = { ...items[idx], [field]: val }
    setForm({ ...form, items })
  }

  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= form.items.length) return
    const items = [...form.items]
    ;[items[idx], items[newIdx]] = [items[newIdx], items[idx]]
    setForm({ ...form, items })
  }

  const handleSave = async () => {
    if (form.items.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/content-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          locale,
          eyebrow: form.eyebrow.trim() || null,
          title: form.title.trim() || null,
          lead: form.lead.trim() || null,
          items: form.items.map((it) => ({
            icon: it.icon || 'check',
            title: it.title.trim(),
            description: it.description.trim(),
          })),
        }),
      })
      if (!res.ok) throw new Error('Sauvegarde échouée')
      setSavedAt(new Date())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Sélecteurs section + langue */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`btn btn-sm ${section === s.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSection(s.key)}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Langue :</span>
          {LOCALES.map((lc) => (
            <button
              key={lc}
              className={`btn btn-sm ${locale === lc ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setLocale(lc)}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              {lc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {savedAt && (
        <div className="alert alert-success" style={{ marginBottom: 16, color: '#16a34a' }}>
          ✓ Sauvegardé à {savedAt.toLocaleTimeString()}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : (
        <div style={{ maxWidth: 700 }}>
          {/* Méta de section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            <label className="form-field">
              <span className="form-label">Sur-titre (eyebrow)</span>
              <input
                type="text"
                value={form.eyebrow}
                onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
                placeholder="Ex : Pourquoi nous choisir"
                className="form-input"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Titre principal</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex : Des engagements concrets"
                className="form-input"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Phrase d'introduction</span>
              <textarea
                value={form.lead}
                onChange={(e) => setForm({ ...form, lead: e.target.value })}
                placeholder="Ex : Depuis 2015, nous accompagnons…"
                rows={2}
                className="form-input"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>
          </div>

          {/* Items / cartes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>
              Cartes ({form.items.length})
            </h4>
            <button className="btn btn-primary btn-sm" onClick={addItem}>
              + Ajouter une carte
            </button>
          </div>

          {form.items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: 10 }}>
              Aucune carte. Cliquez sur « Ajouter une carte ».
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {form.items.map((item, idx) => (
                <div key={idx} style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                    <select
                      value={item.icon}
                      onChange={(e) => updateItem(idx, 'icon', e.target.value)}
                      className="form-input"
                      style={{ width: 'auto', minWidth: 120 }}
                    >
                      {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateItem(idx, 'title', e.target.value)}
                      placeholder="Titre de la carte"
                      className="form-input"
                      style={{ flex: 1, fontWeight: 600 }}
                    />
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Monter">↑</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveItem(idx, 1)} disabled={idx === form.items.length - 1} title="Descendre">↓</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)} title="Supprimer" style={{ color: '#ef4444' }}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="Description de la carte (1-2 phrases)"
                    rows={2}
                    className="form-input"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Save bar */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || form.items.length === 0}
            >
              {saving ? 'Enregistrement…' : block ? 'Mettre à jour' : 'Publier cette section'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
