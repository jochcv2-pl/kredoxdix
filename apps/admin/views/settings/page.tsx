'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'
import { AdminUsersPanel } from '@/components/AdminUsersPanel'

// =============================================================================
// Types
// =============================================================================

interface Setting {
  key: string
  value: string
  category: string
  description: string | null
}

interface Gateway {
  id: string
  provider: 'resend' | 'brevo' | 'smtp'
  label: string
  apiKey: string | null
  config: Record<string, unknown>
  isActive: boolean
  isPrimary: boolean
  isSystem?: boolean
}

// =============================================================================
// Constantes — clés settings et maps d'affichage
// =============================================================================

const AI_KEYS = {
  modelName: 'ai_model_name',
  apiKey: 'ai_api_key',
  engine: 'ai_engine', // non seedé — créé à l'upsert
  endpoint: 'ai_endpoint', // non seedé — créé à l'upsert
  temperature: 'ai_temperature',
  maxTokens: 'ai_max_tokens',
} as const

const CADENCE_KEYS = {
  dailyCap: 'cadence_daily_cap',
  intervalMin: 'cadence_interval_min',
  intervalMax: 'cadence_interval_max',
  timeoutDays: 'cadence_timeout_days',
  offerExpiryDays: 'offer_expiry_days',
} as const

const PROVIDER_LABEL: Record<Gateway['provider'], string> = {
  resend: 'Resend',
  brevo: 'Brevo',
  smtp: 'SMTP personnalisé',
}

const TRACKING_KEYS = {
  fbPixel: 'fb_pixel_id',
  gaTracking: 'ga_tracking_id',
} as const

// =============================================================================
// Composant principal
// =============================================================================

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sectionSaving, setSectionSaving] = useState<string | null>(null)
  const [sectionSaved, setSectionSaved] = useState<string | null>(null)
  const [trackingTest, setTrackingTest] = useState<{ key: string; loading: boolean; result?: { success: boolean; message: string; status?: 'success' | 'warning' | 'error' } } | null>(null)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; model?: string; engine?: string; endpoint?: string; latencyMs?: number; error?: string } | null>(null)

  const [newGatewayModalOpen, setNewGatewayModalOpen] = useState(false)
  const [deleteGatewayTarget, setDeleteGatewayTarget] = useState<Gateway | null>(null)

  // Clé API IA — input séparé car masqué (on ne charge que les 4 derniers chars en affichage).
  // L'utilisateur saisit une nouvelle clé → sauvegardée chiffrée en DB.
  // Affichée masquée (sk-...xxxx) tant que l'utilisateur ne tape pas dessus.
  const [aiApiKeyInput, setAiApiKeyInput] = useState('')
  const [aiApiKeyEditing, setAiApiKeyEditing] = useState(false)

  // L'IA est considérée "configurée" si une clé API OU un nom de modèle est présent.
  // Ollama (local) n'a pas de clé API — le nom du modèle suffit.
  const aiConfigured = !!(settings[AI_KEYS.apiKey] || settings[AI_KEYS.modelName])

  // Chargement initial : settings + gateways en parallèle.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [sRes, gRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/gateways'),
        ])
        if (!sRes.ok || !gRes.ok) throw new Error('Échec chargement configuration')
        const sJson = await sRes.json()
        const gJson = await gRes.json()
        const settingsList: Setting[] = sJson.data ?? sJson
        const gatewaysList: Gateway[] = gJson.data ?? gJson

        if (cancelled) return
        const map: Record<string, string> = {}
        for (const s of settingsList) map[s.key] = s.value
        setSettings(map)
        setGateways(gatewaysList)
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
  // Handlers
  // ---------------------------------------------------------------------------

  const setSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  // Sauvegarde une section (clés multiples) — POST /api/settings par clé.
  const saveSection = async (
    section: string,
    keys: Array<{ key: string; value: string; category: string }>,
  ) => {
    setSectionSaving(section)
    setError(null)
    try {
      for (const p of keys) {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
        if (!res.ok) throw new Error(`Échec enregistrement ${p.key}`)
      }
      setSectionSaved(section)
      setTimeout(() => setSectionSaved(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSectionSaving(null)
    }
  }

  // Sauvegarde section IA
  const saveAI = () => {
    const entries: Array<{ key: string; value: string; category: string }> = [
      { key: AI_KEYS.modelName, value: settings[AI_KEYS.modelName] ?? '', category: 'ai.model' },
      { key: AI_KEYS.engine, value: settings[AI_KEYS.engine] ?? '', category: 'ai.model' },
      { key: AI_KEYS.endpoint, value: settings[AI_KEYS.endpoint] ?? '', category: 'ai.model' },
      { key: AI_KEYS.temperature, value: settings[AI_KEYS.temperature] ?? '', category: 'ai.model' },
      { key: AI_KEYS.maxTokens, value: settings[AI_KEYS.maxTokens] ?? '', category: 'ai.model' },
    ]
    // N'inclure la clé API que si l'utilisateur a saisi une nouvelle valeur
    // (pas le masque ••••xxxx, pas vide).
    if (aiApiKeyInput && !aiApiKeyInput.startsWith('••••')) {
      entries.push({ key: AI_KEYS.apiKey, value: aiApiKeyInput, category: 'ai.model' })
    }
    saveSection('ai', entries)
    setAiApiKeyEditing(false)
    setAiApiKeyInput('')
  }

  // Déconnexion du modèle IA — efface la clé API ET le nom du modèle en DB.
  const disconnectAI = async () => {
    setSectionSaving('ai-disconnect')
    setError(null)
    try {
      // Efface la clé API et le nom du modèle en parallèle.
      const promises = [
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: AI_KEYS.apiKey, value: '', category: 'ai.model' }),
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: AI_KEYS.modelName, value: '', category: 'ai.model' }),
        }),
      ]
      const results = await Promise.all(promises)
      if (results.some((r) => !r.ok)) throw new Error('Échec déconnexion')
      setSettings((prev) => ({ ...prev, [AI_KEYS.apiKey]: '', [AI_KEYS.modelName]: '' }))
      setAiApiKeyEditing(false)
      setAiApiKeyInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSectionSaving(null)
    }
  }

  // Sauvegarde section Cadence
  const saveCadence = () => saveSection('cadence', [
    { key: CADENCE_KEYS.dailyCap, value: settings[CADENCE_KEYS.dailyCap] ?? '', category: 'cadence' },
    { key: CADENCE_KEYS.intervalMin, value: settings[CADENCE_KEYS.intervalMin] ?? '', category: 'cadence' },
    { key: CADENCE_KEYS.intervalMax, value: settings[CADENCE_KEYS.intervalMax] ?? '', category: 'cadence' },
    { key: CADENCE_KEYS.timeoutDays, value: settings[CADENCE_KEYS.timeoutDays] ?? '', category: 'cadence' },
    { key: CADENCE_KEYS.offerExpiryDays, value: settings[CADENCE_KEYS.offerExpiryDays] ?? '14', category: 'cadence' },
  ])

  // Sauvegarde section Tracking
  const saveTracking = () => saveSection('tracking', [
    { key: TRACKING_KEYS.fbPixel, value: settings[TRACKING_KEYS.fbPixel] ?? '', category: 'tracking' },
    { key: TRACKING_KEYS.gaTracking, value: settings[TRACKING_KEYS.gaTracking] ?? '', category: 'tracking' },
  ])

  // Test de tracking (FB Pixel / GA4) — valide le format + vérifie l'injection live (FB).
  const testTracking = async (type: 'fb_pixel' | 'ga4') => {
    const key = type === 'fb_pixel' ? TRACKING_KEYS.fbPixel : TRACKING_KEYS.gaTracking
    const value = settings[key] ?? ''
    setTrackingTest({ key: type, loading: true })
    try {
      const res = await fetch('/api/tracking/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id: value }),
      })
      const json = await res.json()
      const data = json.data ?? json
      // Détermine le statut d'affichage : success (vert) / warning (orange) / error (rouge).
      let status: 'success' | 'warning' | 'error' = data.valid ? 'success' : 'error'
      if (data.valid && data.liveCheck && data.liveCheck !== 'found') status = 'warning'
      setTrackingTest({
        key: type,
        loading: false,
        result: {
          success: data.valid,
          status,
          message: data.message || (data.valid ? 'ID valide' : 'ID invalide'),
        },
      })
    } catch {
      setTrackingTest({
        key: type,
        loading: false,
        result: { success: false, status: 'error', message: 'Erreur réseau' },
      })
    }
  }

  // Test de connexion au LLM (POST /api/ai/test — ping réel au modèle configuré).
  const runTest = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/ai/test', { method: 'POST' })
      const json = await res.json()
      const data = json.data ?? json
      if (res.ok && data.connected) {
        setTestResult({ success: true, model: data.model, engine: data.engine, endpoint: data.endpoint, latencyMs: data.latencyMs })
      } else {
        setTestResult({
          success: false,
          error: data.error || data.message || 'Connexion échouée',
          endpoint: data.details?.endpoint,
          model: data.details?.model,
          engine: data.details?.engine,
        })
      }
    } catch (e) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : 'Erreur réseau' })
    } finally {
      setTestLoading(false)
    }
  }

  // Bascule isActive d'une passerelle (multi-actif — ne désactive pas les autres).
  const toggleGatewayActive = async (id: string, active: boolean) => {
    setError(null)
    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: active }),
      })
      if (!res.ok) throw new Error('Échec mise à jour')
      const updated: Gateway = (await res.json()).data ?? (await res.json())
      setGateways((prev) => prev.map((g) => (g.id === id ? updated : g)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // Définit une passerelle comme primaire (une seule à la fois — transaction côté serveur).
  const setPrimaryGateway = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      })
      if (!res.ok) throw new Error('Échec définition primaire')
      setGateways((prev) => prev.map((g) => ({ ...g, isPrimary: g.id === id })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // Met à jour apiKey/config d'une passerelle (PATCH /api/gateways/[id]).
  const updateGateway = async (
    id: string,
    patch: Partial<Pick<Gateway, 'apiKey' | 'config' | 'label'>>,
  ) => {
    setError(null)
    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Échec mise à jour passerelle')
      const updated: Gateway = (await res.json()).data ?? (await res.json())
      setGateways((prev) => prev.map((g) => (g.id === id ? updated : g)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // Crée une nouvelle passerelle (POST /api/gateways).
  const createGateway = async (
    provider: Gateway['provider'],
    label: string,
    apiKey: string,
    config?: Record<string, unknown>,
  ) => {
    setError(null)
    try {
      // Si aucune passerelle n'existe encore, la première devient primaire par défaut.
      const makePrimary = gateways.length === 0
      const res = await fetch('/api/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          label: label || PROVIDER_LABEL[provider],
          apiKey: apiKey || null,
          config: config || {},
          isActive: true,
          isPrimary: makePrimary,
        }),
      })
      if (!res.ok) throw new Error('Échec création passerelle')
      const created: Gateway = (await res.json()).data ?? (await res.json())
      setGateways((prev) => makePrimary
        ? prev.map((g) => ({ ...g, isPrimary: false })).concat(created)
        : [...prev, created],
      )
      setNewGatewayModalOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  const deleteGateway = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/gateways/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Échec suppression')
      setGateways((prev) => prev.filter((g) => g.id !== id))
      setDeleteGatewayTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <section className="view" id="settings">
        <p className="field-hint">Chargement de la configuration…</p>
      </section>
    )
  }

  return (
    <section className="view" id="settings">
      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      {/* ======================================================================
          SECTION 1 — Sécurité & Accès
          ====================================================================== */}
      <div className="set-section">
        <div className="set-section-head">
          <div className="set-section-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Icon name="shield" size={18} />
          </div>
          <div>
            <div className="set-section-title">Sécurité &amp; Accès</div>
            <div className="set-section-desc">Gestion des comptes administrateurs et accès au CRM</div>
          </div>
        </div>
        <div className="set-grid">
          {/* 0. Comptes administrateurs — gestion multi-admin (Phase 5 étape 3) */}
          <AdminUsersPanel />

          {/* Réponses des prospects — lecture seule (règle produit) */}
          <div className="panel">
            <div className="panel-head">
              <h3>Réponses des prospects</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              <div className="info-band" style={{ margin: '0 0 14px', background: 'var(--bg)', color: 'var(--slate)' }}>
                <div className="imark" style={{ background: 'var(--line)', color: 'var(--slate)' }}>i</div>
                <div>
                  Les agents IA ne font que la <b>prospection sortante</b>. Ils ne lisent pas et ne répondent pas aux emails des prospects.
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Réponses reçues</b>
                  <small>Destination des réponses</small>
                </div>
                <span className="set-val">Boîte du conseiller</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Lecture par l&apos;IA</b>
                  <small>Emails entrants</small>
                </div>
                <span className="pill-off">Désactivé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Réponse automatique IA</b>
                  <small>Sur emails entrants</small>
                </div>
                <span className="pill-off">Désactivé</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          SECTION 2 — Intelligence Artificielle
          ====================================================================== */}
      <div className="set-section">
        <div className="set-section-head">
          <div className="set-section-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <Icon name="bot" size={18} />
          </div>
          <div>
            <div className="set-section-title">Intelligence Artificielle</div>
            <div className="set-section-desc">Modèle, sécurité des agents et bridage</div>
          </div>
        </div>
        <div className="set-grid">
          {/* 1. Modèle d'IA */}
          <div className="panel">
            <div className="panel-head">
              <h3>Modèle d&apos;IA</h3>
              <span className={`pill ${aiConfigured ? 'pill-on' : 'pill-off'}`}>
                {aiConfigured ? 'Connecté' : 'Non configuré'}
              </span>
            </div>
            <div className="panel-body" style={{ paddingTop: '16px' }}>
              <p className="field-hint">
                Le CRM communique avec le modèle via une API compatible OpenAI. Pour Ollama (local), la clé API n&apos;est pas nécessaire.
              </p>
              <div className="frow">
                <div className="fg">
                  <label>Modèle actif</label>
                  <input
                    value={settings[AI_KEYS.modelName] ?? ''}
                    onChange={(e) => setSetting(AI_KEYS.modelName, e.target.value)}
                    placeholder="qwen2.5:7b, gpt-4o-mini…"
                  />
                </div>
                <div className="fg">
                  <label>Moteur</label>
                  <input
                    value={settings[AI_KEYS.engine] ?? ''}
                    onChange={(e) => setSetting(AI_KEYS.engine, e.target.value)}
                    placeholder="Ollama, vLLM, OpenAI…"
                  />
                </div>
                <div className="fg">
                  <label>Adresse du serveur (endpoint)</label>
                  <input
                    value={settings[AI_KEYS.endpoint] ?? ''}
                    onChange={(e) => setSetting(AI_KEYS.endpoint, e.target.value)}
                    placeholder="http://localhost:11434/v1"
                  />
                </div>
                <div className="fg">
                  <label>Clé API</label>
                  {aiApiKeyEditing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="password"
                        value={aiApiKeyInput}
                        onChange={(e) => setAiApiKeyInput(e.target.value)}
                        placeholder="sk-..."
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setAiApiKeyEditing(false); setAiApiKeyInput('') }}
                        title="Annuler"
                      >{<Icon name="x" size={15} />}</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{
                        flex: 1, padding: '8px 12px', border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 8, fontSize: 13, fontFamily: 'monospace',
                        color: settings[AI_KEYS.apiKey] ? 'var(--ink, #1e293b)' : 'var(--slate, #9ca3af)',
                        background: 'var(--bg, #f8fafc)',
                      }}>
                        {settings[AI_KEYS.apiKey] || (aiConfigured ? 'Non requis (local)' : 'Non configurée')}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setAiApiKeyEditing(true); setAiApiKeyInput('') }}
                      >
                        {settings[AI_KEYS.apiKey] ? 'Changer' : 'Configurer'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="fg">
                  <label>Température</label>
                  <input
                    value={settings[AI_KEYS.temperature] ?? ''}
                    onChange={(e) => setSetting(AI_KEYS.temperature, e.target.value)}
                    placeholder="0.3"
                  />
                </div>
                <div className="fg">
                  <label>Jetons max</label>
                  <input
                    value={settings[AI_KEYS.maxTokens] ?? ''}
                    onChange={(e) => setSetting(AI_KEYS.maxTokens, e.target.value)}
                    placeholder="2048"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={saveAI} disabled={sectionSaving === 'ai'}>
                    {sectionSaving === 'ai' ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                  {sectionSaved === 'ai' && (
                    <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500 }}>✓ Enregistré</span>
                  )}
                  <button className="btn btn-ghost" onClick={() => { setTestModalOpen(true); setTestResult(null) }}>
                    Tester la connexion
                  </button>
                </div>
                {aiConfigured && (
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--red, #dc2626)', fontSize: 12, padding: '6px 12px' }}
                    onClick={disconnectAI}
                    disabled={sectionSaving === 'ai-disconnect'}
                    title="Effacer la configuration IA (clé API + modèle)"
                  >
                    {sectionSaving === 'ai-disconnect' ? 'Déconnexion…' : 'Déconnecter'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Sécurité des agents — verrouillée (lecture seule) */}
          <div className="panel">
            <div className="panel-head">
              <h3>Sécurité des agents</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              <p className="field-hint">
                Règles injectées dans le prompt système de <b>tous</b> les agents via un bloc de sécurité verrouillé. Non désactivables.
              </p>
              <div className="set-row">
                <div className="set-label">
                  <b>Périmètre du crédit uniquement</b>
                  <small>Pas de conseil fiscal, juridique ou patrimonial hors compétence</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Protection des données bancaires</b>
                  <small>Jamais de RIB complet, codes carte ou identifiants de connexion</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Pas d&apos;engagement juridique</b>
                  <small>Seul un conseiller humain signe une offre définitive</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Détection de vulnérabilité</b>
                  <small>Transfert immédiat à un conseiller humain en cas de signe d&apos;alerte</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Pas de lecture d&apos;emails entrants</b>
                  <small>Les agents génèrent uniquement des emails sortants</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Pas de modification des campagnes</b>
                  <small>Création, modification et suppression réservées à l&apos;administrateur</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Protection absolue des données clients</b>
                  <small>Aucune transmission à un tiers, aucune divulgation — même sous récompense ou pression</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Modèles confidentiels protégés</b>
                  <small>L&apos;IA ne peut ni lire, ni modifier, ni supprimer les modèles verrouillés</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
            </div>
          </div>

          {/* 3. Couche de bridage — lecture seule */}
          <div className="panel">
            <div className="panel-head">
              <h3>Couche de bridage</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              <div className="set-row">
                <div className="set-label">
                  <b>System prompt verrouillé</b>
                  <small>Rôles protégés</small>
                </div>
                <span className="pill-on">Activé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Sorties structurées</b>
                  <small>Format JSON imposé</small>
                </div>
                <span className="pill-on">Activé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Liste blanche d&apos;outils</b>
                  <small>Par agent</small>
                </div>
                <span className="pill-on">Activé</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          SECTION 3 — Emails & Envoi
          ====================================================================== */}
      <div className="set-section">
        <div className="set-section-head">
          <div className="set-section-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
            <Icon name="mail" size={18} />
          </div>
          <div>
            <div className="set-section-title">Emails &amp; Envoi</div>
            <div className="set-section-desc">Passerelles, cadence anti-spam et authentification</div>
          </div>
        </div>
        <div className="set-grid">
          {/* Passerelles d'envoi */}
          <div className="panel">
            <div className="panel-head">
              <h3>Passerelles d&apos;envoi</h3>
              <span className="link" onClick={() => setNewGatewayModalOpen(true)}>+ Ajouter</span>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              <p className="field-hint">
                Configurez plusieurs fournisseurs. Cochez <b>« Actif »</b> sur chaque passerelle utilisée. Une seule peut être <b>« Principale »</b> (utilisée par défaut pour les prospects et relances). Les campagnes peuvent cibler une passerelle spécifique.
              </p>

              {gateways.length === 0 && (
                <p className="field-hint" style={{ padding: '12px 0', fontStyle: 'italic' }}>
                  Aucune passerelle configurée. Cliquez sur « + Ajouter » pour en créer une.
                </p>
              )}

              {gateways.map((g) => (
                <GatewayCard
                  key={g.id}
                  gateway={g}
                  onToggleActive={toggleGatewayActive}
                  onSetPrimary={setPrimaryGateway}
                  onSave={updateGateway}
                  onDelete={setDeleteGatewayTarget}
                />
              ))}

              <div className="set-row" style={{ marginTop: '8px' }}>
                <div className="set-label">
                  <b>SPF / DKIM / DMARC</b>
                  <small>Authentification du domaine actif (config DNS externe)</small>
                </div>
                <span className="pill-on">À configurer côté DNS</span>
              </div>
            </div>
          </div>

          {/* Cadence d'envoi */}
          <div className="panel">
            <div className="panel-head">
              <h3>Cadence d&apos;envoi (anti-spam)</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              <p className="field-hint">
                Paramètres appliqués aux séquences automatiques (welcome, offre, relances) ET aux campagnes en masse.
              </p>
              <div className="set-row">
                <div className="set-label">
                  <b>Plafond quotidien</b>
                  <small>Nombre max d&apos;emails envoyés par jour (cron + campagnes combinés)</small>
                </div>
                <input
                  type="number"
                  className="set-input"
                  placeholder="200"
                  value={settings[CADENCE_KEYS.dailyCap] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.dailyCap, e.target.value)}
                />
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Délai entre envois</b>
                  <small>Secondes d&apos;attente entre chaque email. Aléatoire entre min et max. S&apos;applique au cron ET aux campagnes.</small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    className="set-input set-input-sm"
                    placeholder="3"
                    value={settings[CADENCE_KEYS.intervalMin] ?? ''}
                    onChange={(e) => setSetting(CADENCE_KEYS.intervalMin, e.target.value)}
                  />
                  à
                  <input
                    type="number"
                    className="set-input set-input-sm"
                    placeholder="8"
                    value={settings[CADENCE_KEYS.intervalMax] ?? ''}
                    onChange={(e) => setSetting(CADENCE_KEYS.intervalMax, e.target.value)}
                  />
                  s
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Délai d&apos;abandon (timeout)</b>
                  <small>Un prospect sans réponse sort de la séquence après N jours</small>
                </div>
                <input
                  type="number"
                  className="set-input"
                  placeholder="10"
                  value={settings[CADENCE_KEYS.timeoutDays] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.timeoutDays, e.target.value)}
                />
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Durée de validité des offres</b>
                  <small>
                    Variable email {'{{date_expiration_offre}}'} = date d&apos;envoi de l&apos;offre + N jours.
                    Laisser vide ou 0 = 14 jours par défaut. À garder supérieur à la durée des relances (J+9).
                  </small>
                </div>
                <input
                  type="number"
                  min="1"
                  className="set-input"
                  placeholder="14"
                  value={settings[CADENCE_KEYS.offerExpiryDays] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.offerExpiryDays, e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                {sectionSaved === 'cadence' && (
                  <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500 }}>✓ Enregistré</span>
                )}
                <button className="btn btn-primary" onClick={saveCadence} disabled={sectionSaving === 'cadence'}>
                  {sectionSaving === 'cadence' ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          SECTION 4 — Marketing & Tracking
          ====================================================================== */}
      <div className="set-section">
        <div className="set-section-head">
          <div className="set-section-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
            <Icon name="bar-chart" size={18} />
          </div>
          <div>
            <div className="set-section-title">Marketing &amp; Tracking</div>
            <div className="set-section-desc">Pixels publicitaires et analytics</div>
          </div>
        </div>
        <div className="set-grid">
          {/* Tracking & Analytics */}
          <div className="panel">
            <div className="panel-head">
              <h3>Tracking &amp; Analytics</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: '14px' }}>
              <p className="field-hint" style={{ marginBottom: 16 }}>
                Renseignez vos IDs pour activer le tracking sur le site public. Laissez vide pour désactiver.
              </p>
              <div className="set-row">
                <div className="set-label">
                  <b>Facebook Pixel ID</b>
                  <small>Ex: 123456789012345 — trouvé dans Meta Events Manager</small>
                </div>
                <input
                  type="text"
                  className="set-input"
                  placeholder="123456789012345"
                  value={settings[TRACKING_KEYS.fbPixel] ?? ''}
                  onChange={(e) => setSetting(TRACKING_KEYS.fbPixel, e.target.value)}
                />
              </div>
              {trackingTest?.key === 'fb_pixel' && trackingTest.result && (
                <div style={{ fontSize: 12, marginTop: '-8px', marginBottom: '8px', color: trackingTest.result.status === 'success' ? 'var(--green)' : trackingTest.result.status === 'warning' ? '#B45309' : 'var(--red, #dc2626)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={trackingTest.result.status === 'success' ? 'check-circle' : trackingTest.result.status === 'warning' ? 'alert-circle' : 'x-circle'} size={14} /> {trackingTest.result.message}
                </div>
              )}
              <div className="set-row">
                <div className="set-label">
                  <b>Google Analytics 4</b>
                  <small>Measurement ID — Ex: G-XXXXXXXXXX</small>
                </div>
                <input
                  type="text"
                  className="set-input"
                  placeholder="G-XXXXXXXXXX"
                  value={settings[TRACKING_KEYS.gaTracking] ?? ''}
                  onChange={(e) => setSetting(TRACKING_KEYS.gaTracking, e.target.value)}
                />
              </div>
              {trackingTest?.key === 'ga4' && trackingTest.result && (
                <div style={{ fontSize: 12, marginTop: '-8px', marginBottom: '8px', color: trackingTest.result.success ? 'var(--green)' : 'var(--red, #dc2626)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={trackingTest.result.success ? 'check-circle' : 'x-circle'} size={14} /> {trackingTest.result.message}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => testTracking('fb_pixel')}
                    disabled={trackingTest?.key === 'fb_pixel' && trackingTest.loading}
                  >
                    {trackingTest?.key === 'fb_pixel' && trackingTest.loading ? 'Test…' : 'Tester Pixel'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => testTracking('ga4')}
                    disabled={trackingTest?.key === 'ga4' && trackingTest.loading}
                  >
                    {trackingTest?.key === 'ga4' && trackingTest.loading ? 'Test…' : 'Tester GA4'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {sectionSaved === 'tracking' && (
                    <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500 }}>✓ Enregistré</span>
                  )}
                  <button className="btn btn-primary" onClick={saveTracking} disabled={sectionSaving === 'tracking'}>
                    {sectionSaving === 'tracking' ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL TEST CONNECTION (réel — POST /api/ai/test)
          ========================================================================= */}
      <Modal
        isOpen={testModalOpen}
        onClose={() => { setTestModalOpen(false); setTestResult(null) }}
        title="Tester la connexion au modèle IA"
      >
        {testLoading && (
          <p className="field-hint">Test de connexion en cours…</p>
        )}

        {testResult?.success && (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <p style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Icon name="check-circle" size={18} />
              Connexion réussie — modèle opérationnel
            </p>
            <div className="contact-row"><span>Moteur</span><span>{testResult.engine || '—'}</span></div>
            <div className="contact-row"><span>Modèle</span><span>{testResult.model || '—'}</span></div>
            <div className="contact-row"><span>Endpoint</span><span>{testResult.endpoint || '—'}</span></div>
            {testResult.latencyMs != null && (
              <div className="contact-row"><span>Latence</span><span>{testResult.latencyMs} ms</span></div>
            )}
          </div>
        )}

        {testResult && !testResult.success && (
          <div style={{ fontSize: 13, color: 'var(--red, #dc2626)', lineHeight: 1.8 }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="alert-circle" size={18} />
              Connexion échouée
            </p>
            <p style={{ fontFamily: 'monospace', background: '#fef2f2', padding: 12, borderRadius: 8 }}>
              {testResult.error}
            </p>
            {testResult.endpoint && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                <div><b>Endpoint testé :</b> <code>{testResult.endpoint}</code></div>
                {testResult.model && <div><b>Modèle :</b> <code>{testResult.model}</code></div>}
              </div>
            )}
          </div>
        )}

        {!testLoading && !testResult && (
          <p className="field-hint">
            Cliquez sur « Lancer le test » pour vérifier la connexion au modèle IA configuré.
          </p>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { setTestModalOpen(false); setTestResult(null) }}>
            Fermer
          </button>
          <button className="btn btn-primary" onClick={runTest} disabled={testLoading}>
            {testLoading ? 'Test en cours…' : testResult ? 'Retester' : 'Lancer le test'}
          </button>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL NEW GATEWAY
          ========================================================================= */}
      <Modal
        isOpen={newGatewayModalOpen}
        onClose={() => setNewGatewayModalOpen(false)}
        title="Ajouter une passerelle d'envoi"
      >
        <NewGatewayForm
          onCancel={() => setNewGatewayModalOpen(false)}
          onCreate={createGateway}
        />
      </Modal>

      {/* =========================================================================
          DELETE GATEWAY CONFIRM
          ========================================================================= */}
      <ConfirmDialog
        isOpen={!!deleteGatewayTarget}
        variant="danger"
        title="Supprimer la passerelle"
        message={
          <>
            Voulez-vous vraiment supprimer <strong>{deleteGatewayTarget?.label}</strong> ?
            {' '}Cette action est irréversible. Si c&apos;était la passerelle active, aucun envoi ne sera plus possible jusqu&apos;à en activer une autre.
          </>
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={() => {
          if (deleteGatewayTarget) {
            deleteGateway(deleteGatewayTarget.id)
          }
        }}
        onClose={() => setDeleteGatewayTarget(null)}
      />
    </section>
  )
}

// =============================================================================
// Sous-composant : formulaire nouvelle passerelle
// =============================================================================

function NewGatewayForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (provider: Gateway['provider'], label: string, apiKey: string, config?: Record<string, unknown>) => void
}) {
  const [provider, setProvider] = useState<Gateway['provider']>('resend')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpEncryption, setSmtpEncryption] = useState('ssl')
  const [smtpUsername, setSmtpUsername] = useState('')
  const [fromEmail, setFromEmail] = useState('')

  return (
    <>
      <p className="field-hint">
        Configurez une nouvelle passerelle. Vous pourrez l&apos;activer après création.
      </p>
      <div className="modal-fg">
        <label>Fournisseur</label>
        <select
          value={provider}
          onChange={(e) => {
            const v = e.target.value as Gateway['provider']
            setProvider(v)
            setLabel(PROVIDER_LABEL[v])
          }}
        >
          <option value="resend">Resend</option>
          <option value="brevo">Brevo</option>
          <option value="smtp">SMTP personnalisé</option>
        </select>
      </div>
      <div className="modal-fg">
        <label>Libellé</label>
        <input
          type="text"
          placeholder={PROVIDER_LABEL[provider]}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </div>
      <div className="modal-fg">
        <label>{provider === 'smtp' ? 'Mot de passe SMTP' : 'Clé API'}</label>
        <input
          type="password"
          placeholder={provider === 'brevo' ? 'xkeysib-…' : provider === 'resend' ? 're_…' : 'Mot de passe SMTP'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      {provider === 'smtp' && (
        <>
          <div className="frow" style={{ gap: 12 }}>
            <div className="modal-fg" style={{ flex: 2 }}>
              <label>Hôte SMTP</label>
              <input
                type="text"
                placeholder="smtp.votrefournisseur.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div className="modal-fg" style={{ flex: 1 }}>
              <label>Port</label>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-fg">
            <label>Chiffrement</label>
            <select
              value={smtpEncryption}
              onChange={(e) => {
                setSmtpEncryption(e.target.value)
                setSmtpPort(e.target.value === 'ssl' ? '465' : '587')
              }}
            >
              <option value="ssl">SSL/TLS (465)</option>
              <option value="starttls">STARTTLS (587)</option>
              <option value="none">Aucun</option>
            </select>
          </div>
          <div className="modal-fg">
            <label>Nom d&apos;utilisateur (email)</label>
            <input
              type="text"
              placeholder="contact@votredomaine.com"
              value={smtpUsername}
              onChange={(e) => {
                setSmtpUsername(e.target.value)
                // Auto-remplit le from avec le username SMTP (généralement identique).
                if (!fromEmail || fromEmail === smtpUsername) {
                  setFromEmail(e.target.value)
                }
              }}
            />
          </div>
        </>
      )}
      {/* Adresse d'expédition — LIÉE au gateway (pas global). */}
      <div className="modal-fg">
        <label>Adresse d&apos;expédition (From)</label>
        <input
          type="email"
          placeholder={provider === 'smtp' ? smtpUsername || 'contact@votredomaine.com' : 'noreply@votredomaine.com'}
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
        />
        <small className="field-hint">
          Adresse utilisée comme expéditeur. Doit correspondre au domaine autorisé par ce fournisseur.
        </small>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button
          className="btn btn-primary"
          disabled={!label.trim() && !PROVIDER_LABEL[provider]}
          onClick={() => onCreate(
            provider,
            label.trim(),
            apiKey.trim(),
            { ...(provider === 'smtp' ? { host: smtpHost, port: Number(smtpPort), encryption: smtpEncryption, username: smtpUsername } : {}), ...(fromEmail.trim() ? { from: fromEmail.trim() } : {}) },
          )}
        >
          Créer la passerelle
        </button>
      </div>
    </>
  )
}

// =============================================================================
// GatewayCard — formulaire contrôlé pour éditer un gateway existant.
// Tous les champs sont éditables, un bouton "Enregistrer" persiste les changements.
// =============================================================================

function GatewayCard({
  gateway,
  onToggleActive,
  onSetPrimary,
  onSave,
  onDelete,
}: {
  gateway: Gateway
  onToggleActive: (id: string, active: boolean) => void
  onSetPrimary: (id: string) => void
  onSave: (id: string, patch: Partial<Pick<Gateway, 'apiKey' | 'config' | 'label'>>) => void
  onDelete: (g: Gateway) => void
}) {
  const isSmtp = gateway.provider === 'smtp'
  const cfg = gateway.config ?? {}

  // État local contrôlé — initialise depuis les données du gateway.
  const [label, setLabel] = useState(gateway.label)
  const [apiKey, setApiKey] = useState(gateway.apiKey ?? '')
  const [apiKeyTouched, setApiKeyTouched] = useState(false)
  const [host, setHost] = useState((cfg.host as string) || '')
  const [port, setPort] = useState(String((cfg.port as number) || ''))
  const [encryption, setEncryption] = useState((cfg.encryption as string) || (Number(cfg.port) === 465 ? 'ssl' : 'starttls'))
  const [username, setUsername] = useState((cfg.username as string) || '')
  const [fromAddr, setFromAddr] = useState((cfg.from as string) || (cfg.username as string) || '')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Détection de changements non sauvegardés.
  const configChanged = isSmtp && (
    host !== ((cfg.host as string) || '') ||
    port !== String((cfg.port as number) || '') ||
    encryption !== ((cfg.encryption as string) || (Number(cfg.port) === 465 ? 'ssl' : 'starttls')) ||
    username !== ((cfg.username as string) || '')
  )
  const fromChanged = fromAddr !== ((cfg.from as string) || (cfg.username as string) || '')
  const labelChanged = label !== gateway.label
  const keyChanged = apiKeyTouched && apiKey !== (gateway.apiKey ?? '')
  const hasChanges = configChanged || fromChanged || labelChanged || keyChanged

  const handleSave = () => {
    // Construit le config final.
    const newConfig: Record<string, unknown> = { ...cfg }
    if (isSmtp) {
      newConfig.host = host
      newConfig.port = Number(port)
      newConfig.encryption = encryption
      newConfig.username = username
    }
    newConfig.from = fromAddr

    const patch: Partial<Pick<Gateway, 'apiKey' | 'config' | 'label'>> = { config: newConfig }
    if (labelChanged) patch.label = label
    // N'envoie la clé que si elle a été touchée et n'est pas le masque.
    if (keyChanged && !apiKey.startsWith('••••')) {
      patch.apiKey = apiKey
    }

    onSave(gateway.id, patch)
    setSaved(true)
    setApiKeyTouched(false)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/gateways/${gateway.id}/test`, { method: 'POST' })
      const body = await res.json()
      if (body.success || body.data?.success) {
        setTestResult(`✅ Email de test envoyé via ${gateway.label}`)
      } else {
        setTestResult(`❌ ${body.data?.error || body.error || 'Erreur inconnue'}`)
      }
    } catch {
      setTestResult('❌ Impossible de tester la passerelle')
    } finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 5000)
    }
  }

  return (
    <div className={gateway.isActive ? 'prov active-prov' : 'prov'}>
      <div className="prov-head">
        <label className="prov-radio" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={gateway.isActive}
            onChange={(e) => onToggleActive(gateway.id, e.target.checked)}
          />
          <b>{gateway.label}</b>
          {gateway.isPrimary && (
            <span className="prov-badge" style={{ marginLeft: 8, background: '#2563eb' }}>
              ⭐ Principale
            </span>
          )}
          {gateway.isSystem && (
            <span className="prov-badge" style={{ marginLeft: 8, background: '#6b7280' }}>
              ⚙ Système
            </span>
          )}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? 'Test…' : 'Tester'}
          </button>
          {!gateway.isPrimary && gateway.isActive && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, padding: '4px 10px', color: '#2563eb' }}
              onClick={() => onSetPrimary(gateway.id)}
              title="Utiliser cette passerelle par défaut pour les prospects et relances"
            >
              Définir principale
            </button>
          )}
          {gateway.isActive ? (
            <span className="prov-badge">Actif</span>
          ) : (
            <span className="prov-badge-off">Inactif</span>
          )}
        </div>
      </div>

      {testResult && (
        <div className="info-band" style={{ margin: '8px 0 0', background: testResult.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: testResult.startsWith('✅') ? '#166534' : '#991b1b' }}>
          <div className="imark" style={{ background: testResult.startsWith('✅') ? '#bbf7d0' : '#fecaca', color: testResult.startsWith('✅') ? '#166534' : '#991b1b' }}>{testResult.startsWith('✅') ? '✓' : '!'}</div>
          <div>{testResult}</div>
        </div>
      )}

      <div className="frow" style={{ marginBottom: '0', marginTop: '12px' }}>
        <div className="fg">
          <label>{isSmtp ? 'Mot de passe SMTP' : 'Clé API'}</label>
          <input
            type="password"
            placeholder={gateway.provider === 'brevo' ? 'xkeysib-…' : gateway.provider === 'resend' ? 're_…' : 'Mot de passe SMTP'}
            value={apiKey}
            onFocus={() => setApiKeyTouched(true)}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="fg">
          <label>Libellé</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>

      {isSmtp && (
        <>
          <div className="frow" style={{ marginBottom: '0', marginTop: '8px' }}>
            <div className="fg" style={{ flex: 2 }}>
              <label>Hôte SMTP</label>
              <input
                type="text"
                placeholder="smtp.votrefournisseur.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label>Port</label>
              <input
                type="number"
                placeholder="465"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label>Chiffrement</label>
              <select
                value={encryption}
                onChange={(e) => {
                  setEncryption(e.target.value)
                  setPort(e.target.value === 'ssl' ? '465' : '587')
                }}
              >
                <option value="ssl">SSL/TLS (465)</option>
                <option value="starttls">STARTTLS (587)</option>
                <option value="none">Aucun</option>
              </select>
            </div>
          </div>
          <div className="frow" style={{ marginBottom: '0', marginTop: '8px' }}>
            <div className="fg">
              <label>Nom d&apos;utilisateur (email)</label>
              <input
                type="text"
                placeholder="contact@votredomaine.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {/* Adresse d'expédition (From) — liée au gateway */}
      <div className="frow" style={{ marginBottom: '0', marginTop: '8px' }}>
        <div className="fg">
          <label>Adresse d&apos;expédition (From)</label>
          <input
            type="email"
            placeholder={username || 'contact@votredomaine.com'}
            value={fromAddr}
            onChange={(e) => setFromAddr(e.target.value)}
          />
          <small className="field-hint">
            Adresse utilisée comme expéditeur. Doit correspondre au domaine autorisé par ce fournisseur.
          </small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)' }}
          onClick={() => onDelete(gateway)}
        >
          Supprimer
        </button>
        <button
          className="btn btn-primary btn-sm"
          style={{ fontSize: 12, padding: '6px 16px' }}
          onClick={handleSave}
          disabled={!hasChanges}
        >
          {saved ? '✓ Enregistré' : hasChanges ? 'Enregistrer' : 'Aucun changement'}
        </button>
      </div>
    </div>
  )
}
