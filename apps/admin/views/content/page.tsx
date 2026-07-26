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
      <style>{`
        .ct-tab {
          padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap;
        }
        .ct-tab.active {
          background: linear-gradient(135deg, #2B8BDE, #1E6FB8); color: #fff;
          box-shadow: 0 2px 8px rgba(43,139,222,0.25);
        }
        .ct-tab:not(.active) {
          background: transparent; color: #64748b;
        }
        .ct-tab:not(.active):hover { background: rgba(43,139,222,0.06); color: #2B8BDE; }
        .ct-locale {
          padding: 5px 11px; border-radius: 6px; font-size: 12px; font-weight: 700;
          cursor: pointer; border: none; transition: all 0.15s; min-width: 36px; text-align: center;
        }
        .ct-locale.active { background: #1e293b; color: #fff; }
        .ct-locale:not(.active) { background: transparent; color: #94a3b8; }
        .ct-locale:not(.active):hover { background: #f1f5f9; color: #475569; }
        .ct-input {
          padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 10px;
          font-size: 14px; color: #1e293b; background: #fff; width: 100%;
          transition: border-color 0.15s, box-shadow 0.15s; outline: none;
          font-family: inherit;
        }
        .ct-input:focus {
          border-color: #2B8BDE; box-shadow: 0 0 0 3px rgba(43,139,222,0.1);
        }
        .ct-input::placeholder { color: #cbd5e1; }
        .ct-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: #64748b; display: block; margin-bottom: 6px;
        }
        .ct-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
          padding: 18px; transition: border-color 0.15s, box-shadow 0.15s;
          position: relative;
        }
        .ct-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .ct-card-num {
          position: absolute; top: -10px; left: 16px;
          width: 24px; height: 24px; border-radius: 7px;
          background: linear-gradient(135deg, #2B8BDE, #1E6FB8); color: #fff;
          font-size: 12px; font-weight: 700; display: grid; place-items: center;
          box-shadow: 0 2px 6px rgba(43,139,222,0.3);
        }
        .ct-icon-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          display: grid; place-items: center; cursor: pointer;
          transition: background 0.15s; background: transparent; color: #94a3b8;
          font-size: 15px;
        }
        .ct-icon-btn:hover { background: #f1f5f9; color: #475569; }
        .ct-icon-btn.danger:hover { background: rgba(239,68,68,0.08); color: #ef4444; }
        .ct-icon-btn:disabled { opacity: 0.25; cursor: default; }
        .ct-icon-btn:disabled:hover { background: transparent; color: #94a3b8; }
      `}</style>

      {/* ===== Toolbar : Section + Langue ===== */}
      <div style={{
        display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap',
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
        padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        {/* Tabs sections */}
        <div style={{ display: 'flex', gap: 4, background: '#f8fafc', borderRadius: 10, padding: 4 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`ct-tab ${section === s.key ? 'active' : ''}`}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 32, background: '#e5e7eb' }} />

        {/* Langues */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginRight: 6 }}>
            Langue
          </span>
          {LOCALES.map((lc) => (
            <button
              key={lc}
              className={`ct-locale ${locale === lc ? 'active' : ''}`}
              onClick={() => setLocale(lc)}
            >
              {lc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Alerts ===== */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
          color: '#dc2626', fontSize: 13, fontWeight: 500,
        }}>
          {error}
        </div>
      )}
      {savedAt && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
          color: '#16a34a', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#22c55e', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>✓</span>
          Sauvegardé à {savedAt.toLocaleTimeString()}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          Chargement…
        </div>
      ) : (
        <div style={{ maxWidth: 760 }}>
          {/* ===== Section meta : eyebrow / title / lead ===== */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 32,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
            padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            {/* Bandeau section header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingBottom: 14, borderBottom: '1px solid #f1f5f9',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(43,139,222,0.1), rgba(43,139,222,0.05))',
                display: 'grid', placeItems: 'center',
              }}>
                <Icon name="layout" size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  {SECTIONS.find((s) => s.key === section)?.label}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {locale.toUpperCase()} · {block ? 'Modifié' : 'Nouveau'}
                </div>
              </div>
            </div>

            <div>
              <label className="ct-label">Sur-titre (eyebrow)</label>
              <input
                type="text"
                className="ct-input"
                value={form.eyebrow}
                onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
                placeholder="Ex : Pourquoi nous choisir"
              />
            </div>
            <div>
              <label className="ct-label">Titre principal</label>
              <input
                type="text"
                className="ct-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex : Des engagements concrets"
                style={{ fontSize: 15, fontWeight: 600 }}
              />
            </div>
            <div>
              <label className="ct-label">Phrase d'introduction</label>
              <textarea
                className="ct-input"
                value={form.lead}
                onChange={(e) => setForm({ ...form, lead: e.target.value })}
                placeholder="Ex : Depuis 2015, nous accompagnons…"
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {/* ===== Items header ===== */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                Cartes
              </h4>
              <span style={{
                padding: '2px 8px', borderRadius: 6,
                background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#64748b',
              }}>
                {form.items.length}
              </span>
            </div>
            <button
              onClick={addItem}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: '1px dashed #2B8BDE', background: 'rgba(43,139,222,0.04)',
                color: '#2B8BDE', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              + Ajouter
            </button>
          </div>

          {/* ===== Cards list ===== */}
          {form.items.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 48, borderRadius: 14,
              border: '2px dashed #e5e7eb', background: '#fafbfc',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                Aucune carte
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                Cliquez sur « Ajouter » pour créer votre première carte.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {form.items.map((item, idx) => (
                <div key={idx} className="ct-card" style={{ paddingTop: 22 }}>
                  {/* Numéro */}
                  <div className="ct-card-num">{idx + 1}</div>

                  {/* Actions en haut à droite */}
                  <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 2 }}>
                    <button className="ct-icon-btn" onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Monter">↑</button>
                    <button className="ct-icon-btn" onClick={() => moveItem(idx, 1)} disabled={idx === form.items.length - 1} title="Descendre">↓</button>
                    <button className="ct-icon-btn danger" onClick={() => removeItem(idx)} title="Supprimer">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>

                  {/* Ligne 1 : icône + titre */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                    <select
                      value={item.icon}
                      onChange={(e) => updateItem(idx, 'icon', e.target.value)}
                      style={{
                        width: 'auto', minWidth: 130, padding: '9px 12px',
                        border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13,
                        background: '#fff', color: '#1e293b', cursor: 'pointer',
                        outline: 'none', fontFamily: 'inherit',
                      }}
                    >
                      {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                    <input
                      type="text"
                      className="ct-input"
                      value={item.title}
                      onChange={(e) => updateItem(idx, 'title', e.target.value)}
                      placeholder="Titre de la carte"
                      style={{ flex: 1, fontWeight: 600 }}
                    />
                  </div>

                  {/* Ligne 2 : description */}
                  <textarea
                    className="ct-input"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="Description (1-2 phrases)"
                    rows={2}
                    style={{ resize: 'vertical', fontSize: 13, background: '#f8fafc', color: '#64748b' }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ===== Save bar ===== */}
          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
            marginTop: 28, paddingTop: 18, borderTop: '2px solid #f1f5f9',
          }}>
            <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
              {block ? 'Dernière mise à jour appliquée' : 'Nouveau contenu'}
            </span>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || form.items.length === 0}
              style={{
                padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {saving ? 'Enregistrement…' : block ? 'Mettre à jour' : 'Publier'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
