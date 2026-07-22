'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'

// =============================================================================
// Types
// =============================================================================

interface SeoSettings {
  seo_meta_title: string
  seo_meta_description: string
  seo_robots_index: string // "true" | "false" (DB stocke en string)
  seo_og_image?: string
  seo_keywords?: string
}

interface AgentSeo {
  id: string
  name: string
  role: string
  isActive: boolean
  systemPrompt?: string
  memories: { id: string; key: string; value: string }[]
}

const DEFAULTS: SeoSettings = {
  seo_meta_title: 'Kredix — Courtier en crédit',
  seo_meta_description: 'Comparez les offres de prêt immobilier et consommation.',
  seo_robots_index: 'true',
  seo_og_image: '',
  seo_keywords: '',
}

// =============================================================================
// Composant principal
// =============================================================================

export default function SEO() {
  const [auditModalOpen, setAuditModalOpen] = useState(false)
  const [seo, setSeo] = useState<SeoSettings>(DEFAULTS)
  const [agent, setAgent] = useState<AgentSeo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // ---------------------------------------------------------------------------
  // Chargement initial
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [sRes, aRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/agents'),
        ])
        if (!sRes.ok) throw new Error('Échec chargement settings')
        const sJson = await sRes.json()
        const settingsArr: { key: string; value: string }[] = sJson.data ?? sJson

        // Pivot array -> objet { key -> value } en filtrant les clés SEO.
        const seoFromDb: SeoSettings = { ...DEFAULTS }
        for (const s of settingsArr) {
          if (s.key in DEFAULTS) {
            ;(seoFromDb as unknown as Record<string, string>)[s.key] = s.value
          }
        }

        // Agent SEO — la route /api/agents retourne tous les agents, on filtre côté client.
        let agentData: AgentSeo | null = null
        if (aRes.ok) {
          const aJson = await aRes.json()
          const agents: AgentSeo[] = aJson.data ?? aJson
          const seoAgent = agents.find((a) => a.role === 'seo')
          if (seoAgent) {
            // Récupérer les memories détaillés.
            const mRes = await fetch(`/api/agents/${seoAgent.id}/memories`)
            if (mRes.ok) {
              const mJson = await mRes.json()
              seoAgent.memories = mJson.data ?? mJson ?? []
            } else {
              seoAgent.memories = []
            }
            agentData = seoAgent
          }
        }

        if (cancelled) return
        setSeo(seoFromDb)
        setAgent(agentData)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Save SEO metadata — POST upsert sur /api/settings
  // ---------------------------------------------------------------------------

  const saveSeo = async () => {
    setSaving(true)
    setError(null)
    try {
      // La route /api/settings accepte un seul {key,value} à la fois (upsert).
      // On parallélise les POST pour tous les champs SEO.
      const entries = Object.entries(seo).map(([key, value]) => ({
        key,
        value: String(value),
        category: 'seo',
      }))
      const results = await Promise.all(
        entries.map((body) =>
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        ),
      )
      const failed = results.find((r) => !r.ok)
      if (failed) {
        const err = await failed.json().catch(() => null)
        throw new Error(err?.error ?? `Échec sauvegarde (HTTP ${failed.status})`)
      }
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle isActive agent SEO
  // ---------------------------------------------------------------------------

  const toggleAgentActive = async () => {
    if (!agent) return
    setError(null)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !agent.isActive }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? 'Échec mise à jour agent')
      }
      setAgent({ ...agent, isActive: !agent.isActive })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // ---------------------------------------------------------------------------
  // Save mémoire agent SEO
  // ---------------------------------------------------------------------------

  const saveMemory = async (memId: string | null, key: string, value: string) => {
    if (!agent) return
    setError(null)
    try {
      if (memId) {
        const res = await fetch(`/api/agents/${agent.id}/memories/${memId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!res.ok) throw new Error('Échec update mémoire')
      } else {
        const res = await fetch(`/api/agents/${agent.id}/memories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!res.ok) throw new Error('Échec création mémoire')
        const created = (await res.json()).data ?? (await res.json())
        setAgent({
          ...agent,
          memories: [...agent.memories, { id: created.id, key, value }],
        })
        return
      }
      setAgent({
        ...agent,
        memories: agent.memories.map((m) => (m.id === memId ? { ...m, key, value } : m)),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <section className="view" id="seo">
        <p className="field-hint">Chargement des données SEO…</p>
      </section>
    )
  }

  return (
    <section className="view" id="seo">
      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      <div className="agents-layout">
        <div>
          {/* ========================================================
              MÉTADONNÉES SEO GLOBALES (câblées /api/settings)
              ======================================================== */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h3>Métadonnées SEO globales</h3>
              {savedAt && (
                <span style={{ fontSize: 11, color: 'var(--green)' }}>
                  <Icon name="check" size={12} /> Enregistré à {savedAt.toLocaleTimeString('fr-FR')}
                </span>
              )}
            </div>
            <div className="panel-body" style={{ paddingTop: 18 }}>
              <p className="field-hint" style={{ marginBottom: 14 }}>
                Ces valeurs alimentent les balises <code>&lt;title&gt;</code>, <code>meta description</code>,{' '}
                <code>meta robots</code> et <code>og:image</code> de la landing page publique.
              </p>
              <div className="modal-fg">
                <label>Titre SEO (meta title)</label>
                <input
                  value={seo.seo_meta_title}
                  onChange={(e) => setSeo({ ...seo, seo_meta_title: e.target.value })}
                  maxLength={70}
                />
                <small className="field-hint">{seo.seo_meta_title.length}/70 caractères</small>
              </div>
              <div className="modal-fg">
                <label>Description (meta description)</label>
                <textarea
                  value={seo.seo_meta_description}
                  onChange={(e) => setSeo({ ...seo, seo_meta_description: e.target.value })}
                  maxLength={170}
                  rows={3}
                />
                <small className="field-hint">{seo.seo_meta_description.length}/170 caractères</small>
              </div>
              <div className="modal-fg">
                <label>Mots-clés cibles (optionnel)</label>
                <input
                  value={seo.seo_keywords ?? ''}
                  onChange={(e) => setSeo({ ...seo, seo_keywords: e.target.value })}
                  placeholder="courtier crédit, prêt immobilier, meilleur taux…"
                />
                <small className="field-hint">Pour référence interne — n&apos;affecte pas directement le SEO on-page.</small>
              </div>
              <div className="modal-fg">
                <label>Image Open Graph (og:image)</label>
                <input
                  value={seo.seo_og_image ?? ''}
                  onChange={(e) => setSeo({ ...seo, seo_og_image: e.target.value })}
                  placeholder="/og-image.png"
                />
              </div>
              <div className="set-row" style={{ marginTop: 8 }}>
                <div className="set-label">
                  <b>Indexation Google</b>
                  <small> Autoriser les moteurs à indexer le site</small>
                </div>
                <span
                  className={seo.seo_robots_index === 'true' ? 'pill-on' : 'pill-off'}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    setSeo({
                      ...seo,
                      seo_robots_index: seo.seo_robots_index === 'true' ? 'false' : 'true',
                    })
                  }
                >
                  {seo.seo_robots_index === 'true' ? 'Autorisé' : 'Bloqué'}
                </span>
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={saveSeo}
                disabled={saving}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer les métadonnées'}
              </button>
            </div>
          </div>

          {/* Score SEO global — issu d'un cron d'audit futur */}
          <div className="panel">
            <div className="panel-head">
              <h3>Dernier audit SEO</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setAuditModalOpen(true)}>
                Lancer l&apos;audit
              </button>
            </div>
            <div className="panel-body" style={{ paddingTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    background: 'conic-gradient(var(--orange) 0 71%,var(--line-soft) 71% 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: '50%',
                      background: 'var(--card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 800,
                    }}
                  >
                    71
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.7 }}>
                  Dernier audit : pas encore exécuté.<br />
                  L&apos;audit analyse balises title, meta descriptions, headings, alt images,<br />
                  Core Web Vitals, hreflang, sitemap et HTTPS.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          {/* ========================================================
              AGENT SEO (câblé /api/agents)
              ======================================================== */}
          {agent && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-head">
                <h3>Agent SEO</h3>
                <span
                  className={agent.isActive ? 'pill-on' : 'pill-off'}
                  style={{ cursor: 'pointer' }}
                  onClick={toggleAgentActive}
                  title={agent.isActive ? 'Désactiver' : 'Activer'}
                >
                  {agent.isActive ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <div className="panel-body" style={{ paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 11,
                      background: '#0EA5E9',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    AS
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{agent.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--slate)' }}>Audit et recommandations SEO</div>
                  </div>
                </div>
                <p className="field-hint">
                  Il analyse le site, détecte les problèmes de référencement et propose des correctifs.
                  Il n&apos;applique aucune modification sans validation de l&apos;admin.
                </p>
                <MemoryEditor memories={agent.memories} onSave={saveMemory} />
              </div>
            </div>
          )}

          {/* Suggestions prioritaires — lecture-only (sera alimenté par cron futur) */}
          <div className="panel">
            <div className="panel-head">
              <h3>Suggestions prioritaires</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 14, fontSize: 12, color: 'var(--slate)', lineHeight: 1.7 }}>
              Les suggestions apparaîtront automatiquement après le prochain audit programmé.
              En attendant, vérifiez que la <b>meta description</b> est renseignée ci-contre et que
              les <b>images</b> du Hero ont un attribut <code>alt</code> descriptif.
            </div>
          </div>
        </div>
      </div>

      {/* Modal audit (placeholder — l'agent SEO est désactivé pour l'instant) */}
      <Modal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        title="Audit SEO en cours"
      >
        <p className="field-hint">
          L&apos;audit complet nécessite l&apos;activation de l&apos;Agent SEO et sera exécuté par un cron dédié.
        </p>
        <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.8 }}>
          Étapes prévues :<br />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>• Balises title et meta descriptions <Icon name="check" size={16} style={{ color: 'var(--green)' }} /></span><br />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>• Structure des headings (H1, H2, H3) <Icon name="refresh-cw" size={16} style={{ color: 'var(--orange)' }} /></span><br />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>• Performance Core Web Vitals <Icon name="refresh-cw" size={16} style={{ color: 'var(--orange)' }} /></span><br />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>• Liens internes et maillage <Icon name="refresh-cw" size={16} style={{ color: 'var(--orange)' }} /></span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setAuditModalOpen(false)}>Fermer</button>
        </div>
      </Modal>
    </section>
  )
}

// =============================================================================
// MemoryEditor — réutilise le pattern de la vue agents
// =============================================================================

function MemoryEditor({
  memories,
  onSave,
}: {
  memories: { id: string; key: string; value: string }[]
  onSave: (memId: string | null, key: string, value: string) => void
}) {
  const [local, setLocal] = useState(() => memories.map((m) => ({ ...m })))
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  // Resync si la liste change côté serveur.
  useEffect(() => {
    setLocal(memories.map((m) => ({ ...m })))
  }, [memories])

  return (
    <>
      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--slate)', margin: '16px 0 8px' }}>
        Mémoire de l&apos;agent
      </h4>
      <div className="mem-list">
        {local.map((m, i) => (
          <div className="mem-item" key={m.id}>
            <input
              className="mem-key-input"
              value={m.key}
              onChange={(e) => {
                const next = [...local]
                next[i] = { ...m, key: e.target.value }
                setLocal(next)
              }}
              onBlur={() => {
                const orig = memories[i]
                if (orig && (orig.key !== m.key || orig.value !== m.value)) {
                  onSave(m.id, m.key, m.value)
                }
              }}
            />
            <input
              className="mem-val-input"
              value={m.value}
              onChange={(e) => {
                const next = [...local]
                next[i] = { ...m, value: e.target.value }
                setLocal(next)
              }}
              onBlur={() => {
                const orig = memories[i]
                if (orig && (orig.key !== m.key || orig.value !== m.value)) {
                  onSave(m.id, m.key, m.value)
                }
              }}
            />
          </div>
        ))}
      </div>
      <div className="mem-add" style={{ marginTop: 8 }}>
        <input
          className="mem-key-input"
          placeholder="nouvelle_clé"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <input
          className="mem-val-input"
          placeholder="valeur"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <button
          className="btn btn-ghost btn-sm"
          disabled={!newKey.trim()}
          onClick={() => {
            if (newKey.trim()) {
              onSave(null, newKey.trim(), newValue)
              setNewKey('')
              setNewValue('')
            }
          }}
        >
          + Ajouter
        </button>
      </div>
    </>
  )
}
