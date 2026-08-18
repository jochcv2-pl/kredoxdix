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
  advisorName: 'advisor_name',
  agencyAddress: 'agency_address',
  formUrl: 'url_formulaire',
  messengerUrl: 'url_messenger',
  advisorContactUrl: 'url_contact_conseiller',
  activeLanguages: 'cms_active_languages',
  // Formulaire public — note sous les boutons sociaux (une clé par langue).
  socialNote: (code: string) => `cms_social_note_${code}`,
  // Formulaire public — libellés des boutons sociaux (une clé par langue).
  waLabel: (code: string) => `cms_social_wa_label_${code}`,
  msLabel: (code: string) => `cms_social_ms_label_${code}`,
  waVisible: 'social_whatsapp_visible',
  msVisible: 'social_messenger_visible',
} as const

// Texte i18n par défaut de la note, par langue (placeholder du champ CMS).
const SOCIAL_NOTE_DEFAULTS: Record<string, string> = {
  fr: 'Contactez un conseiller Kredix pour un traitement prioritaire de votre dossier, réponse en moins de 2 heures.',
  en: 'Contact a Kredix advisor for priority processing of your application, response in under 2 hours.',
  de: 'Kontaktieren Sie einen Kredix-Berater für eine bevorzugte Bearbeitung Ihres Antrags, Antwort in weniger als 2 Stunden.',
  es: 'Contacte con un asesor de Kredix para un procesamiento prioritario de su solicitud, respuesta en menos de 2 horas.',
  pt: 'Contacte um consultor da Kredix para um processamento prioritário do seu pedido, resposta em menos de 2 horas.',
  it: "Contatta un consulente di Kredix per un'elaborazione prioritaria della tua richiesta, risposta in meno di 2 ore.",
}

// Libellés i18n par défaut des boutons sociaux, par langue (placeholders CMS).
const SOCIAL_LABEL_DEFAULTS: Record<'wa' | 'ms', Record<string, string>> = {
  wa: {
    fr: 'Discuter sur WhatsApp',
    en: 'Chat on WhatsApp',
    de: 'Auf WhatsApp schreiben',
    es: 'Chatear en WhatsApp',
    pt: 'Falar no WhatsApp',
    it: 'Chatta su WhatsApp',
  },
  ms: {
    fr: 'Discuter sur Messenger',
    en: 'Chat on Messenger',
    de: 'Auf Messenger schreiben',
    es: 'Chatear en Messenger',
    pt: 'Falar no Messenger',
    it: 'Chatta su Messenger',
  },
}

// Catégories de settings par section (pour la sauvegarde indépendante).
// Section "Formulaire" éclatée en 4 sous-sections indépendantes :
// titres WhatsApp / titres Messenger / note / visibilité des boutons.
type SectionId = 'hero' | 'services' | 'coord' | 'langues' | 'formWa' | 'formMs' | 'formNote' | 'formBtns'

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
  const [coord, setCoord] = useState({ tel: '', whatsapp: '', email: '', orias: '', siteUrl: '', advisorName: '', agencyAddress: '', formUrl: '', messengerUrl: '', advisorContactUrl: '' })
  const [languesActives, setLanguesActives] = useState<Record<string, boolean>>(
    Object.fromEntries(LANGUES.map((l) => [l, true])),
  )
  // Formulaire public : note par langue (code → texte) + boutons sociaux.
  const [formNote, setFormNote] = useState<Record<string, string>>(
    Object.fromEntries(Object.values(LANG_CODE).map((c) => [c, ''])),
  )
  // Libellés des boutons WhatsApp/Messenger par langue (code → texte).
  const [socialLabels, setSocialLabels] = useState<{ wa: Record<string, string>; ms: Record<string, string> }>({
    wa: Object.fromEntries(Object.values(LANG_CODE).map((c) => [c, ''])),
    ms: Object.fromEntries(Object.values(LANG_CODE).map((c) => [c, ''])),
  })
  const [socialBtns, setSocialBtns] = useState({ whatsapp: true, messenger: true })

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
    formWa: null,
    formMs: null,
    formNote: null,
    formBtns: null,
  })
  // Erreur par section.
  const [sectionError, setSectionError] = useState<Record<SectionId, string | null>>({
    hero: null,
    services: null,
    coord: null,
    langues: null,
    formWa: null,
    formMs: null,
    formNote: null,
    formBtns: null,
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
          advisorName: byKey.get(KEYS.advisorName) ?? '',
          agencyAddress: byKey.get(KEYS.agencyAddress) ?? '',
          formUrl: byKey.get(KEYS.formUrl) ?? '',
          messengerUrl: byKey.get(KEYS.messengerUrl) ?? '',
          advisorContactUrl: byKey.get(KEYS.advisorContactUrl) ?? '',
        })

        const langsCsv = byKey.get(KEYS.activeLanguages) ?? 'fr,en,de,es,pt,it'
        const active = new Set(langsCsv.split(',').map((s) => s.trim()).filter(Boolean))
        setLanguesActives(Object.fromEntries(LANGUES.map((l) => [l, active.has(LANG_CODE[l])])))

        setFormNote(
          Object.fromEntries(
            Object.values(LANG_CODE).map((c) => [c, byKey.get(KEYS.socialNote(c)) ?? '']),
          ),
        )
        setSocialLabels({
          wa: Object.fromEntries(
            Object.values(LANG_CODE).map((c) => [c, byKey.get(KEYS.waLabel(c)) ?? '']),
          ),
          ms: Object.fromEntries(
            Object.values(LANG_CODE).map((c) => [c, byKey.get(KEYS.msLabel(c)) ?? '']),
          ),
        })
        setSocialBtns({
          whatsapp: byKey.get(KEYS.waVisible) !== 'false',
          messenger: byKey.get(KEYS.msVisible) !== 'false',
        })
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

  // Toggle bouton social — garde : au moins un des deux doit rester visible.
  const toggleSocialBtn = (which: 'whatsapp' | 'messenger') => {
    setSocialBtns((prev) => {
      if (prev[which]) {
        const other = which === 'whatsapp' ? 'messenger' : 'whatsapp'
        if (!prev[other]) {
          setSectionError((s) => ({ ...s, formBtns: 'Au moins un bouton doit rester visible.' }))
          return prev // refus : l'autre est déjà masqué
        }
      }
      setSectionError((s) => ({ ...s, formBtns: null }))
      return { ...prev, [which]: !prev[which] }
    })
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
    { key: KEYS.tel, value: coord.tel, category: 'contact', description: 'Téléphone du conseiller.' },
    { key: KEYS.whatsapp, value: coord.whatsapp, category: 'contact', description: 'Numéro WhatsApp.' },
    { key: KEYS.email, value: coord.email, category: 'contact', description: 'Email du conseiller.' },
    { key: KEYS.orias, value: coord.orias, category: 'legal', description: "Numéro ORIAS (obligation d'affichage)." },
    { key: KEYS.siteUrl, value: coord.siteUrl, category: 'general', description: 'URL du site (utilisée pour les liens de désinscription dans les emails).' },
    { key: KEYS.advisorName, value: coord.advisorName, category: 'contact', description: 'Nom du conseiller affiché dans les emails.' },
    { key: KEYS.agencyAddress, value: coord.agencyAddress, category: 'contact', description: 'Adresse du siège social.' },
    { key: KEYS.formUrl, value: coord.formUrl, category: 'contact', description: 'URL du formulaire de contact (variable email {{url_formulaire}}).' },
    { key: KEYS.messengerUrl, value: coord.messengerUrl, category: 'contact', description: 'URL Messenger (variable email {{url_messenger}}).' },
    { key: KEYS.advisorContactUrl, value: coord.advisorContactUrl, category: 'contact', description: 'URL de contact du conseiller (variable email {{url_contact_conseiller}}).' },
  ])

  const saveLangues = () => {
    const activeLangs = LANGUES.filter((l) => languesActives[l])
      .map((l) => LANG_CODE[l])
      .join(',')
    saveSection('langues', [
      { key: KEYS.activeLanguages, value: activeLangs, category: 'cms.i18n', description: 'Langues actives sur le site (CSV de codes).' },
    ])
  }

  const saveFormWaLabels = () => {
    saveSection('formWa', Object.values(LANG_CODE).map((code) => ({
      key: KEYS.waLabel(code),
      value: socialLabels.wa[code] ?? '',
      category: 'cms.form',
      description: `Libellé du bouton WhatsApp du formulaire (langue ${code.toUpperCase()}). Vide = texte par défaut.`,
    })))
  }

  const saveFormMsLabels = () => {
    saveSection('formMs', Object.values(LANG_CODE).map((code) => ({
      key: KEYS.msLabel(code),
      value: socialLabels.ms[code] ?? '',
      category: 'cms.form',
      description: `Libellé du bouton Messenger du formulaire (langue ${code.toUpperCase()}). Vide = texte par défaut.`,
    })))
  }

  const saveFormNote = () => {
    saveSection('formNote', Object.values(LANG_CODE).map((code) => ({
      key: KEYS.socialNote(code),
      value: formNote[code] ?? '',
      category: 'cms.form',
      description: `Note sous les boutons sociaux du formulaire (langue ${code.toUpperCase()}). Vide = texte par défaut.`,
    })))
  }

  const saveFormBtns = () => {
    // Garde re-vérifiée à la sauvegarde (défense en profondeur).
    if (!socialBtns.whatsapp && !socialBtns.messenger) {
      setSectionError((s) => ({ ...s, formBtns: 'Au moins un bouton doit rester visible.' }))
      return
    }
    saveSection('formBtns', [
      { key: KEYS.waVisible, value: socialBtns.whatsapp ? 'true' : 'false', category: 'cms.form', description: 'Visibilité du bouton WhatsApp sur le formulaire.' },
      { key: KEYS.msVisible, value: socialBtns.messenger ? 'true' : 'false', category: 'cms.form', description: 'Visibilité du bouton Messenger sur le formulaire.' },
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
                <label>Nom du conseiller</label>
                <input value={coord.advisorName} onChange={(e) => setCoord({ ...coord, advisorName: e.target.value })} placeholder="Ex : Marie Lefèvre" />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Téléphone du conseiller</label>
                <input value={coord.tel} onChange={(e) => setCoord({ ...coord, tel: e.target.value })} placeholder="Ex : +33 1 23 45 67 89" />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Email du conseiller</label>
                <input value={coord.email} onChange={(e) => setCoord({ ...coord, email: e.target.value })} placeholder="Ex : marie@kredix.fr" />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>WhatsApp</label>
                <input value={coord.whatsapp} onChange={(e) => setCoord({ ...coord, whatsapp: e.target.value })} placeholder="Ex : +33 6 12 34 56 78" />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Adresse du siège social</label>
                <input value={coord.agencyAddress} onChange={(e) => setCoord({ ...coord, agencyAddress: e.target.value })} placeholder="Ex : 12 rue de la Finance, 75001 Paris" />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>URL du formulaire de contact</label>
                <input value={coord.formUrl} onChange={(e) => setCoord({ ...coord, formUrl: e.target.value })} placeholder="https://…/demande" />
                <span className="field-hint" style={{ display: 'block', marginTop: 4 }}>Variable email : {'{{url_formulaire}}'}</span>
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>URL Messenger</label>
                <input value={coord.messengerUrl} onChange={(e) => setCoord({ ...coord, messengerUrl: e.target.value })} placeholder="https://m.me/…" />
                <span className="field-hint" style={{ display: 'block', marginTop: 4 }}>Variable email : {'{{url_messenger}}'}</span>
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>URL contact conseiller</label>
                <input value={coord.advisorContactUrl} onChange={(e) => setCoord({ ...coord, advisorContactUrl: e.target.value })} placeholder="https://calendly.com/… ou https://wa.me/…" />
                <span className="field-hint" style={{ display: 'block', marginTop: 4 }}>Variable email : {'{{url_contact_conseiller}}'}</span>
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Numéro ORIAS</label>
                <input value={coord.orias} onChange={(e) => setCoord({ ...coord, orias: e.target.value })} placeholder="Ex : 12345678" />
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

          {/* ===== FORMULAIRE — VISIBILITÉ DES BOUTONS ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Formulaire — boutons visibles</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Boutons « Discuter sur WhatsApp / Messenger » du formulaire public.
                Masquez l&apos;un des deux : le bouton restant s&apos;étend automatiquement
                en pleine largeur. Au moins un bouton doit rester visible.
              </p>
              <div className="tool-grid">
                <div className="tool">
                  <div className="tool-name">WhatsApp</div>
                  <div
                    className={'mini-toggle' + (socialBtns.whatsapp ? '' : ' off')}
                    onClick={() => toggleSocialBtn('whatsapp')}
                    title={socialBtns.whatsapp ? 'Visible — cliquer pour masquer' : 'Masqué — cliquer pour afficher'}
                  >
                    <div className="mini-knob"></div>
                  </div>
                </div>
                <div className="tool">
                  <div className="tool-name">Messenger</div>
                  <div
                    className={'mini-toggle' + (socialBtns.messenger ? '' : ' off')}
                    onClick={() => toggleSocialBtn('messenger')}
                    title={socialBtns.messenger ? 'Visible — cliquer pour masquer' : 'Masqué — cliquer pour afficher'}
                  >
                    <div className="mini-knob"></div>
                  </div>
                </div>
              </div>
            </div>
            {renderSaveBtn('formBtns', saveFormBtns)}
          </div>

          {/* ===== FORMULAIRE — TITRE WHATSAPP ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Formulaire — titre WhatsApp</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Titre du bouton WhatsApp, par langue. Laissez vide pour utiliser
                le texte par défaut de la langue.
              </p>
              {LANGUES.map((l) => {
                const code = LANG_CODE[l]
                return (
                  <div className="fg" style={{ marginBottom: 10 }} key={`wa-${code}`}>
                    <label>Titre WhatsApp ({l})</label>
                    <input
                      value={socialLabels.wa[code] ?? ''}
                      onChange={(e) => setSocialLabels((prev) => ({ ...prev, wa: { ...prev.wa, [code]: e.target.value } }))}
                      placeholder={SOCIAL_LABEL_DEFAULTS.wa[code]}
                    />
                  </div>
                )
              })}
            </div>
            {renderSaveBtn('formWa', saveFormWaLabels)}
          </div>

          {/* ===== FORMULAIRE — TITRE MESSENGER ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Formulaire — titre Messenger</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Titre du bouton Messenger, par langue. Laissez vide pour utiliser
                le texte par défaut de la langue.
              </p>
              {LANGUES.map((l) => {
                const code = LANG_CODE[l]
                return (
                  <div className="fg" style={{ marginBottom: 10 }} key={`ms-${code}`}>
                    <label>Titre Messenger ({l})</label>
                    <input
                      value={socialLabels.ms[code] ?? ''}
                      onChange={(e) => setSocialLabels((prev) => ({ ...prev, ms: { ...prev.ms, [code]: e.target.value } }))}
                      placeholder={SOCIAL_LABEL_DEFAULTS.ms[code]}
                    />
                  </div>
                )
              })}
            </div>
            {renderSaveBtn('formMs', saveFormMsLabels)}
          </div>

          {/* ===== FORMULAIRE — NOTE SOUS LES BOUTONS ===== */}
          <div className="panel">
            <div className="panel-head">
              <h3>Formulaire — note sous les boutons</h3>
            </div>
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Note affichée sous les boutons, par langue. Laissez vide pour utiliser
                le texte par défaut de la langue.
              </p>
              {LANGUES.map((l) => {
                const code = LANG_CODE[l]
                return (
                  <div className="fg" style={{ marginBottom: 10 }} key={`note-${code}`}>
                    <label>Note ({l})</label>
                    <input
                      value={formNote[code] ?? ''}
                      onChange={(e) => setFormNote((prev) => ({ ...prev, [code]: e.target.value }))}
                      placeholder={SOCIAL_NOTE_DEFAULTS[code]}
                    />
                  </div>
                )
              })}
            </div>
            {renderSaveBtn('formNote', saveFormNote)}
          </div>
        </div>
      </div>
    </section>
  )
}
