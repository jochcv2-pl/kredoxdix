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
  warmupWeeks: 'cadence_warmup_weeks',
  ipType: 'cadence_ip_type',
  dedicatedIp: 'cadence_dedicated_ip',
  sendingDomain: 'cadence_sending_domain',
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
  const [trackingTest, setTrackingTest] = useState<{ key: string; loading: boolean; result?: { success: boolean; message: string } } | null>(null)
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
    { key: CADENCE_KEYS.warmupWeeks, value: settings[CADENCE_KEYS.warmupWeeks] ?? '', category: 'cadence' },
    { key: CADENCE_KEYS.ipType, value: settings[CADENCE_KEYS.ipType] ?? 'shared', category: 'cadence' },
    { key: CADENCE_KEYS.dedicatedIp, value: settings[CADENCE_KEYS.dedicatedIp] ?? '', category: 'cadence' },
    { key: CADENCE_KEYS.sendingDomain, value: settings[CADENCE_KEYS.sendingDomain] ?? '', category: 'cadence' },
  ])

  // Sauvegarde section Tracking
  const saveTracking = () => saveSection('tracking', [
    { key: TRACKING_KEYS.fbPixel, value: settings[TRACKING_KEYS.fbPixel] ?? '', category: 'tracking' },
    { key: TRACKING_KEYS.gaTracking, value: settings[TRACKING_KEYS.gaTracking] ?? '', category: 'tracking' },
  ])

  // Sauvegarde section Email (from_email)
  const saveEmail = () => saveSection('email', [
    { key: 'from_email', value: settings['from_email'] ?? '', category: 'email' },
  ])

  // Test de tracking (FB Pixel / GA4) — valide le format de l'ID.
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
      setTrackingTest({
        key: type,
        loading: false,
        result: {
          success: data.valid,
          message: data.message || (data.valid ? 'ID valide' : 'ID invalide'),
        },
      })
    } catch {
      setTrackingTest({
        key: type,
        loading: false,
        result: { success: false, message: 'Erreur réseau' },
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

  // Active une passerelle (PATCH /api/gateways/[id] isActive=true — déclenche la
  // désactivation transactionnelle des autres côté serveur).
  const activateGateway = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) throw new Error('Échec activation')
      const updated: Gateway = (await res.json()).data ?? (await res.json())
      setGateways((prev) =>
        prev.map((g) => ({ ...g, isActive: g.id === updated.id })),
      )
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
      const res = await fetch('/api/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          label: label || PROVIDER_LABEL[provider],
          apiKey: apiKey || null,
          config: config || {},
          isActive: false,
        }),
      })
      if (!res.ok) throw new Error('Échec création passerelle')
      const created: Gateway = (await res.json()).data ?? (await res.json())
      setGateways((prev) => [...prev, created])
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={saveAI} disabled={sectionSaving === 'ai'}>
                    {sectionSaving === 'ai' ? 'Enregistrement…' : sectionSaved === 'ai' ? 'Enregistré' : 'Enregistrer'}
                  </button>
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
                Règles appliquées à <b>tous</b> les agents, non désactivables. Elles s&apos;ajoutent au bridage de chaque rôle.
              </p>
              <div className="set-row">
                <div className="set-label">
                  <b>Rester dans le rôle et le contexte</b>
                  <small>Aucune sortie du périmètre défini</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Confidentialité des données</b>
                  <small>Ne jamais transmettre de données clients/admin</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Refus des jeux / détournements</b>
                  <small>Avec un inconnu comme avec un admin</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Respect des limites</b>
                  <small>Jamais de dépassement des garde-fous</small>
                </div>
                <span className="pill-on">Verrouillé</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Filtre entrée / sortie</b>
                  <small>Contrôle avant et après le modèle</small>
                </div>
                <span className="pill-on">Activé</span>
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
              {/* Adresse d'expédition globale */}
              <div className="fg" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label>Adresse d&apos;expédition (from_email)</label>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={saveEmail}
                    disabled={sectionSaving === 'email'}
                  >
                    {sectionSaving === 'email' ? 'Enregistrement…' : sectionSaved === 'email' ? 'Enregistré' : 'Enregistrer'}
                  </button>
                </div>
                <input
                  value={settings['from_email'] ?? ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, from_email: e.target.value }))}
                  placeholder="Marque <noreply@domaine.fr>"
                />
                <small className="field-hint">
                  Utilisé pour tous les emails transactionnels. Si vide, fallback sur la config du gateway actif ou l&apos;adresse par défaut.
                </small>
              </div>

              <p className="field-hint">
                Configurez plusieurs fournisseurs. L&apos;admin remplit la clé API de chacun ; seul le fournisseur <b>coché « Actif »</b> est utilisé pour l&apos;envoi.
              </p>

              {gateways.length === 0 && (
                <p className="field-hint" style={{ padding: '12px 0', fontStyle: 'italic' }}>
                  Aucune passerelle configurée. Cliquez sur « + Ajouter » pour en créer une.
                </p>
              )}

              {gateways.map((g) => (
                <div key={g.id} className={g.isActive ? 'prov active-prov' : 'prov'}>
                  <div className="prov-head">
                    <label className="prov-radio">
                      <input
                        type="radio"
                        name="prov"
                        checked={g.isActive}
                        onChange={() => activateGateway(g.id)}
                      />
                      <b>{g.label}</b>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={async () => {
                          setError(null)
                          try {
                            const res = await fetch(`/api/gateways/${g.id}/test`, { method: 'POST' })
                            const body = await res.json()
                            if (body.success || body.data?.success) {
                              alert(`Email de test envoyé avec succès via ${g.label}`)
                            } else {
                              alert(`Échec : ${body.data?.error || body.error || 'Erreur inconnue'}`)
                            }
                          } catch {
                            alert('Impossible de tester la passerelle')
                          }
                        }}
                      >
                        Tester
                      </button>
                      {g.isActive ? (
                        <span className="prov-badge">Actif</span>
                      ) : (
                        <span className="prov-badge-off">Inactif</span>
                      )}
                    </div>
                  </div>
                  <div className="frow" style={{ marginBottom: '0', marginTop: '12px' }}>
                    <div className="fg">
                      <label>{g.provider === 'smtp' ? 'Mot de passe SMTP' : 'Clé API'}</label>
                      <input
                        type="password"
                        placeholder={g.provider === 'brevo' ? 'xkeysib-…' : g.provider === 'resend' ? 're_…' : 'Mot de passe SMTP'}
                        defaultValue={g.apiKey ?? ''}
                        onBlur={(e) => {
                          if (e.target.value !== (g.apiKey ?? '')) {
                            updateGateway(g.id, { apiKey: e.target.value })
                          }
                        }}
                      />
                    </div>
                    <div className="fg">
                      <label>Libellé</label>
                      <input
                        defaultValue={g.label}
                        onBlur={(e) => {
                          if (e.target.value !== g.label) {
                            updateGateway(g.id, { label: e.target.value })
                          }
                        }}
                      />
                    </div>
                  </div>
                  {/* Champs SMTP supplémentaires */}
                  {g.provider === 'smtp' && (
                    <div className="frow" style={{ marginBottom: '0', marginTop: '8px' }}>
                      <div className="fg" style={{ flex: 2 }}>
                        <label>Hôte SMTP</label>
                        <input
                          type="text"
                          placeholder="smtp.votrefournisseur.com"
                          defaultValue={(g.config?.host as string) || ''}
                          onBlur={(e) => {
                            const val = e.target.value
                            if (val !== (g.config?.host as string)) {
                              updateGateway(g.id, { config: { ...g.config, host: val } })
                            }
                          }}
                        />
                      </div>
                      <div className="fg" style={{ flex: 1 }}>
                        <label>Port</label>
                        <input
                          type="number"
                          placeholder="465"
                          defaultValue={(g.config?.port as number) || ''}
                          onBlur={(e) => {
                            const val = Number(e.target.value)
                            if (val !== (g.config?.port as number)) {
                              updateGateway(g.id, { config: { ...g.config, port: val } })
                            }
                          }}
                        />
                      </div>
                      <div className="fg" style={{ flex: 1 }}>
                        <label>Chiffrement</label>
                        <select
                          defaultValue={(g.config?.encryption as string) || (Number(g.config?.port) === 465 ? 'ssl' : 'starttls')}
                          onChange={(e) => {
                            const enc = e.target.value
                            const newPort = enc === 'ssl' ? 465 : 587
                            updateGateway(g.id, { config: { ...g.config, encryption: enc, port: newPort } })
                          }}
                        >
                          <option value="ssl">SSL/TLS (465)</option>
                          <option value="starttls">STARTTLS (587)</option>
                          <option value="none">Aucun</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {g.provider === 'smtp' && (
                    <div className="frow" style={{ marginBottom: '0', marginTop: '8px' }}>
                      <div className="fg">
                        <label>Nom d&apos;utilisateur (email)</label>
                        <input
                          type="text"
                          placeholder="contact@votredomaine.com"
                          defaultValue={(g.config?.username as string) || ''}
                          onBlur={(e) => {
                            const val = e.target.value
                            if (val !== (g.config?.username as string)) {
                              updateGateway(g.id, { config: { ...g.config, username: val } })
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)' }}
                      onClick={() => setDeleteGatewayTarget(g)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
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
                Le CRM planifie les envois avec des limites strictes pour protéger la réputation du domaine.
              </p>
              <div className="set-row">
                <div className="set-label">
                  <b>Montée en charge (warm-up)</b>
                  <small>Volume progressif les premières semaines</small>
                </div>
                <input
                  type="number"
                  className="set-input"
                  value={settings[CADENCE_KEYS.warmupWeeks] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.warmupWeeks, e.target.value)}
                />
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Plafond quotidien</b>
                  <small>Emails max par jour</small>
                </div>
                <input
                  type="number"
                  className="set-input"
                  value={settings[CADENCE_KEYS.dailyCap] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.dailyCap, e.target.value)}
                />
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Intervalle entre envois</b>
                  <small>Espacement aléatoire</small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    className="set-input set-input-sm"
                    value={settings[CADENCE_KEYS.intervalMin] ?? ''}
                    onChange={(e) => setSetting(CADENCE_KEYS.intervalMin, e.target.value)}
                  />
                  à
                  <input
                    type="number"
                    className="set-input set-input-sm"
                    value={settings[CADENCE_KEYS.intervalMax] ?? ''}
                    onChange={(e) => setSetting(CADENCE_KEYS.intervalMax, e.target.value)}
                  />
                  s
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Type d&apos;IP</b>
                  <small>shared, dedicated ou vps</small>
                </div>
                <select
                  className="set-select"
                  value={settings[CADENCE_KEYS.ipType] ?? 'shared'}
                  onChange={(e) => setSetting(CADENCE_KEYS.ipType, e.target.value)}
                >
                  <option value="shared">IP partagée (ESP)</option>
                  <option value="dedicated">IP dédiée (ESP)</option>
                  <option value="vps">VPS + IP dédiée</option>
                </select>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Adresse IP du VPS (si dédiée)</b>
                  <small>Laisser vide si IP partagée</small>
                </div>
                <input
                  type="text"
                  className="set-input"
                  placeholder="Ex: 51.91.123.45"
                  value={settings[CADENCE_KEYS.dedicatedIp] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.dedicatedIp, e.target.value)}
                />
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Domaine d&apos;envoi</b>
                  <small>Doit être configuré chez le fournisseur (SPF/DKIM/DMARC)</small>
                </div>
                <input
                  type="text"
                  className="set-input"
                  placeholder="votredomaine.com"
                  value={settings[CADENCE_KEYS.sendingDomain] ?? ''}
                  onChange={(e) => setSetting(CADENCE_KEYS.sendingDomain, e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button className="btn btn-primary" onClick={saveCadence} disabled={sectionSaving === 'cadence'}>
                  {sectionSaving === 'cadence' ? 'Enregistrement…' : sectionSaved === 'cadence' ? 'Enregistré' : 'Enregistrer'}
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
                <div style={{ fontSize: 12, marginTop: '-8px', marginBottom: '8px', color: trackingTest.result.success ? 'var(--green)' : 'var(--red, #dc2626)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={trackingTest.result.success ? 'check-circle' : 'x-circle'} size={14} /> {trackingTest.result.message}
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
                <button className="btn btn-primary" onClick={saveTracking} disabled={sectionSaving === 'tracking'}>
                  {sectionSaving === 'tracking' ? 'Enregistrement…' : sectionSaved === 'tracking' ? 'Enregistré' : 'Enregistrer'}
                </button>
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
            <label>Nom d'utilisateur (email)</label>
            <input
              type="text"
              placeholder="contact@votredomaine.com"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
            />
          </div>
        </>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button
          className="btn btn-primary"
          disabled={!label.trim() && !PROVIDER_LABEL[provider]}
          onClick={() => onCreate(
            provider,
            label.trim(),
            apiKey.trim(),
            provider === 'smtp' ? { host: smtpHost, port: Number(smtpPort), encryption: smtpEncryption, username: smtpUsername } : undefined,
          )}
        >
          Créer la passerelle
        </button>
      </div>
    </>
  )
}
