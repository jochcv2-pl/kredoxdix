'use client'

import { useEffect, useState, useCallback } from 'react'
import { Icon } from '@/components/Icon'

const LANGUES = ['Français', 'English', 'Deutsch', 'Español', 'Português', 'Italiano'] as const

// Map langue affichée <-> code stocké en settings (cms_active_languages, CSV).
const LANG_CODE: Record<string, string> = {
  Français: 'fr',
  English: 'en',
  Deutsch: 'de',
  Español: 'es',
  Português: 'pt',
  Italiano: 'it',
}

// Clés settings attendues (upsert si elles n'existent pas — POST /api/settings est un upsert).
const KEYS = {
  heroTitle: 'cms_hero_title',
  heroSubtitle: 'cms_hero_subtitle',
  heroCtaPrimary: 'cms_hero_cta_primary',
  heroCtaSecondary: 'cms_hero_cta_secondary',
  service1: 'cms_service_1',
  service2: 'cms_service_2',
  service3: 'cms_service_3',
  service4: 'cms_service_4',
  tel: 'contact_phone',
  whatsapp: 'whatsapp_number',
  email: 'contact_email',
  orias: 'orias_number',
  siteUrl: 'site_url',
  activeLanguages: 'cms_active_languages',
} as const

// Catégories de settings par section (pour la sauvegarde indépendante).
type SectionId = 'hero' | 'services' | 'coord' | 'langues'

interface SettingPayload {
  key: string
  value: string
  category: string
  description: string
}

interface Setting {
  key: string
  value: string
  category: string
  description: string | null
}

export default function CMS() {
  // Identité de marque (nom + logo).
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameResult, setRenameResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Valeurs éditables localement (chargées depuis l'API au mount).
  const [hero, setHero] = useState({
    titre: '',
    sousTitre: '',
    btnPrincipal: '',
    btnSecondaire: '',
  })
  const [services, setServices] = useState({ s1: '', s2: '', s3: '', s4: '' })
  const [coord, setCoord] = useState({ tel: '', whatsapp: '', email: '', orias: '', siteUrl: '' })
  const [languesActives, setLanguesActives] = useState<Record<string, boolean>>(
    Object.fromEntries(LANGUES.map((l) => [l, true])),
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Sauvegarde indépendante par section ---
  const [savingSection, setSavingSection] = useState<SectionId | null>(null)
  // Timestamp de dernière sauvegarde par section.
  const [savedAt, setSavedAt] = useState<Record<SectionId, Date | null>>({
    hero: null,
    services: null,
    coord: null,
    langues: null,
  })
  // Erreur par section.
  const [sectionError, setSectionError] = useState<Record<SectionId, string | null>>({
    hero: null,
    services: null,
    coord: null,
    langues: null,
  })

  // Chargement initial : GET /api/settings (toutes catégories).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/settings')
        if (!res.ok) throw new Error('Échec chargement settings')
        const json = await res.json()
        const settings: Setting[] = json.data ?? json
        const byKey = new Map(settings.map((s) => [s.key, s.value]))

        if (cancelled) return
        setBrandName(byKey.get('site_name') ?? 'Kredix')
        setBrandLogo(byKey.get('cms_logo_url') ?? '')
        setHero({
          titre: byKey.get(KEYS.heroTitle) ?? '',
          sousTitre: byKey.get(KEYS.heroSubtitle) ?? '',
          btnPrincipal: byKey.get(KEYS.heroCtaPrimary) ?? '',
          btnSecondaire: byKey.get(KEYS.heroCtaSecondary) ?? '',
        })
        setServices({
          s1: byKey.get(KEYS.service1) ?? '',
          s2: byKey.get(KEYS.service2) ?? '',
          s3: byKey.get(KEYS.service3) ?? '',
          s4: byKey.get(KEYS.service4) ?? '',
        })
        setCoord({
          tel: byKey.get(KEYS.tel) ?? '',
          whatsapp: byKey.get(KEYS.whatsapp) ?? '',
          email: byKey.get(KEYS.email) ?? '',
          orias: byKey.get(KEYS.orias) ?? '',
          siteUrl: byKey.get(KEYS.siteUrl) ?? '',
        })

        const langsCsv = byKey.get(KEYS.activeLanguages) ?? 'fr,en,de,es,pt,it'
        const active = new Set(langsCsv.split(',').map((s) => s.trim()).filter(Boolean))
        setLanguesActives(Object.fromEntries(LANGUES.map((l) => [l, active.has(LANG_CODE[l])])))
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

  const toggleLangue = (l: string) => {
    setLanguesActives((prev) => ({ ...prev, [l]: !prev[l] }))
  }

  // Renomme la marque globalement (POST /api/cms/rename — transaction sur Settings + EmailTemplates).
  const renameBrand = async () => {
    const trimmed = brandName.trim()
    if (!trimmed) return
    setRenaming(true)
    setRenameResult(null)
    try {
      const res = await fetch('/api/cms/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Échec du renommage')
      }
      const data = await res.json()
      const d = data.data ?? data
      setRenameResult({ ok: true, msg: `Marque mise à jour — ${d.settingsUpdated} paramètre(s) et ${d.templatesUpdated} template(s) modifié(s).` })
      // Sauvegarde aussi le logo si modifié.
      if (brandLogo !== '') {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'cms_logo_url', value: brandLogo, category: 'cms.branding', description: 'URL du logo.' }),
        })
      }
    } catch (e) {
      setRenameResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' })
    } finally {
      setRenaming(false)
    }
  }

  // Sauvegarde une section spécifique (upsert séquentiel des clés concernées).
  const saveSection = useCallback(async (sectionId: SectionId, payload: SettingPayload[]) => {
    setSavingSection(sectionId)
    setSectionError((prev) => ({ ...prev, [sectionId]: null }))
    try {
      for (const p of payload) {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
        if (!res.ok) throw new Error(`Échec enregistrement ${p.key}`)
      }
      setSavedAt((prev) => ({ ...prev, [sectionId]: new Date() }))
    } catch (e) {
      setSectionError((prev) => ({ ...prev, [sectionId]: e instanceof Error ? e.message : 'Erreur' }))
    } finally {
      setSavingSection(null)
    }
  }, [])

  const saveHero = () => saveSection('hero', [
    { key: KEYS.heroTitle, value: hero.titre, category: 'cms.hero', description: 'Titre principal du hero.' },
    { key: KEYS.heroSubtitle, value: hero.sousTitre, category: 'cms.hero', description: 'Sous-titre du hero.' },
    { key: KEYS.heroCtaPrimary, value: hero.btnPrincipal, category: 'cms.hero', description: 'Bouton CTA principal du hero.' },
    { key: KEYS.heroCtaSecondary, value: hero.btnSecondaire, category: 'cms.hero', description: 'Bouton CTA secondaire du hero.' },
  ])

  const saveServices = () => saveSection('services', [
    { key: KEYS.service1, value: services.s1, category: 'cms.services', description: 'Libellé service 1.' },
    { key: KEYS.service2, value: services.s2, category: 'cms.services', description: 'Libellé service 2.' },
    { key: KEYS.service3, value: services.s3, category: 'cms.services', description: 'Libellé service 3.' },
    { key: KEYS.service4, value: services.s4, category: 'cms.services', description: 'Libellé service 4.' },
  ])

  const saveCoord = () => saveSection('coord', [
    { key: KEYS.tel, value: coord.tel, category: 'contact', description: 'Téléphone affiché.' },
    { key: KEYS.whatsapp, value: coord.whatsapp, category: 'contact', description: 'Numéro WhatsApp.' },
    { key: KEYS.email, value: coord.email, category: 'contact', description: 'Email de contact.' },
    { key: KEYS.orias, value: coord.orias, category: 'legal', description: "Numéro ORIAS (obligation d'affichage)." },
    { key: KEYS.siteUrl, value: coord.siteUrl, category: 'general', description: 'URL du site (utilisée pour les liens de désinscription dans les emails).' },
  ])

  const saveLangues = () => {
    const activeLangs = LANGUES.filter((l) => languesActives[l])
      .map((l) => LANG_CODE[l])
      .join(',')
    saveSection('langues', [
      { key: KEYS.activeLanguages, value: activeLangs, category: 'cms.i18n', description: 'Langues actives sur le site (CSV de codes).' },
    ])
  }

  if (loading) {
    return (
      <section className="view" id="cms">
        <p className="field-hint">Chargement du contenu…</p>
      </section>
    )
  }

  // Bouton de sauvegarde de section avec feedback inline.
  const renderSaveBtn = (
    sectionId: SectionId,
    onSave: () => void,
  ) => {
    const isSaving = savingSection === sectionId
    const lastSaved = savedAt[sectionId]
    const err = sectionError[sectionId]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={isSaving}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {isSaving ? (
            <>
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'cms-spin 0.6s linear infinite' }} />
              Enregistrement…
            </>
          ) : (
            <>
              <Icon name="save" size={15} />
              Enregistrer
            </>
          )}
        </button>
        {lastSaved && !err && (
          <span style={{ fontSize: 12, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="check-circle" size={13} />
            {lastSaved.toLocaleTimeString()}
          </span>
        )}
        {err && (
          <span style={{ fontSize: 12, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="x-circle" size={13} />
            {err}
          </span>
        )}
      </div>
    )
  }

  return (
    <section className="view" id="cms">
      <style>{`
        @keyframes cms-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="info-band">
        <div className="imark">i</div>
        <div>
          Modifiez tout le contenu du site public depuis ici. Chaque section a son propre
          bouton « Enregistrer » — les changements s&apos;appliquent directement aux pages en ligne.
        </div>
      </div>

      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      {/* ===== IDENTITÉ DE MARQUE ===== */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h3>Identité de marque</h3>
        </div>
        <div className="panel-body" style={{ paddingTop: 16 }}>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Le nom de marque est utilisé partout (sidebar, login, site public, emails, footer).
            Le renommer met à jour tous les templates d&apos;emails et paramètres en une seule transaction.
          </p>
          <div className="frow" style={{ marginBottom: 12 }}>
            <div className="fg">
              <label>Nom de la marque</label>
              <input
                value={brandName}
                onChange={(e) => { setBrandName(e.target.value); setRenameResult(null) }}
                placeholder="Kredix"
              />
            </div>
            <div className="fg">
              <label>URL du logo (optionnel)</label>
              <input
                value={brandLogo}
                onChange={(e) => setBrandLogo(e.target.value)}
                placeholder="https://… (SVG/PNG transparent, 400×100px)"
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={renameBrand}
              disabled={renaming || !brandName.trim()}
            >
              {renaming ? 'Renommage…' : 'Appliquer le renommage global'}
            </button>
            {renameResult && (
              <span style={{ fontSize: 13, color: renameResult.ok ? '#16a34a' : '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name={renameResult.ok ? 'check-circle' : 'x-circle'} size={14} />
                {renameResult.msg}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div>
          {/* ===== SECTION HERO ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Section Hero (accueil)</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label>Titre principal</label>
                <input
                  value={hero.titre}
                  onChange={(e) => setHero({ ...hero, titre: e.target.value })}
                />
              </div>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label>Sous-titre</label>
                <input
                  value={hero.sousTitre}
                  onChange={(e) => setHero({ ...hero, sousTitre: e.target.value })}
                />
              </div>
              <div className="frow" style={{ marginBottom: 0 }}>
                <div className="fg">
                  <label>Bouton principal</label>
                  <input
                    value={hero.btnPrincipal}
                    onChange={(e) => setHero({ ...hero, btnPrincipal: e.target.value })}
                  />
                </div>
                <div className="fg">
                  <label>Bouton secondaire</label>
                  <input
                    value={hero.btnSecondaire}
                    onChange={(e) => setHero({ ...hero, btnSecondaire: e.target.value })}
                  />
                </div>
              </div>
            </div>
            {renderSaveBtn('hero', saveHero)}
          </div>

          {/* ===== NOS SERVICES ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Nos services</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Service 1</label>
                <input value={services.s1} onChange={(e) => setServices({ ...services, s1: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Service 2</label>
                <input value={services.s2} onChange={(e) => setServices({ ...services, s2: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Service 3</label>
                <input value={services.s3} onChange={(e) => setServices({ ...services, s3: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label>Service 4</label>
                <input value={services.s4} onChange={(e) => setServices({ ...services, s4: e.target.value })} />
              </div>
            </div>
            {renderSaveBtn('services', saveServices)}
          </div>
        </div>

        <div>
          {/* ===== COORDONNÉES ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Coordonnées</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Téléphone</label>
                <input value={coord.tel} onChange={(e) => setCoord({ ...coord, tel: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>WhatsApp</label>
                <input value={coord.whatsapp} onChange={(e) => setCoord({ ...coord, whatsapp: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Email conseiller</label>
                <input value={coord.email} onChange={(e) => setCoord({ ...coord, email: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Numéro ORIAS</label>
                <input value={coord.orias} onChange={(e) => setCoord({ ...coord, orias: e.target.value })} />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label>URL du site (pour les liens de désinscription)</label>
                <input value={coord.siteUrl} onChange={(e) => setCoord({ ...coord, siteUrl: e.target.value })} placeholder="https://kredix.fr" />
              </div>
            </div>
            {renderSaveBtn('coord', saveCoord)}
          </div>

          {/* ===== LANGUES ACTIVES ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Langues actives</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
               <div className="tool-grid">
                 {LANGUES.map((l) => (
                   <div className="tool" key={l}>
                     <div className="tool-name">{l}</div>
                     <div
                       className={'mini-toggle' + (languesActives[l] ? '' : ' off')}
                       onClick={() => toggleLangue(l)}
                     >
                       <div className="mini-knob"></div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
            {renderSaveBtn('langues', saveLangues)}
          </div>
        </div>
      </div>
    </section>
  )
}
