'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
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
  activeLanguages: 'cms_active_languages',
} as const

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
  const [coord, setCoord] = useState({ tel: '', whatsapp: '', email: '', orias: '' })
  const [languesActives, setLanguesActives] = useState<Record<string, boolean>>(
    Object.fromEntries(LANGUES.map((l) => [l, true])),
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publierModalOpen, setPublierModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Publication : POST /api/settings (upsert par clé) pour toutes les valeurs éditées.
  const publish = async () => {
    setSaving(true)
    setError(null)
    try {
      const activeLangs = LANGUES.filter((l) => languesActives[l])
        .map((l) => LANG_CODE[l])
        .join(',')

      const payload: Array<{ key: string; value: string; category: string; description: string }> = [
        { key: KEYS.heroTitle, value: hero.titre, category: 'cms.hero', description: 'Titre principal du hero.' },
        { key: KEYS.heroSubtitle, value: hero.sousTitre, category: 'cms.hero', description: 'Sous-titre du hero.' },
        { key: KEYS.heroCtaPrimary, value: hero.btnPrincipal, category: 'cms.hero', description: 'Bouton CTA principal du hero.' },
        { key: KEYS.heroCtaSecondary, value: hero.btnSecondaire, category: 'cms.hero', description: 'Bouton CTA secondaire du hero.' },
        { key: KEYS.service1, value: services.s1, category: 'cms.services', description: 'Libellé service 1.' },
        { key: KEYS.service2, value: services.s2, category: 'cms.services', description: 'Libellé service 2.' },
        { key: KEYS.service3, value: services.s3, category: 'cms.services', description: 'Libellé service 3.' },
        { key: KEYS.service4, value: services.s4, category: 'cms.services', description: 'Libellé service 4.' },
        { key: KEYS.tel, value: coord.tel, category: 'contact', description: 'Téléphone affiché.' },
        { key: KEYS.whatsapp, value: coord.whatsapp, category: 'contact', description: 'Numéro WhatsApp.' },
        { key: KEYS.email, value: coord.email, category: 'contact', description: 'Email de contact.' },
        { key: KEYS.orias, value: coord.orias, category: 'legal', description: "Numéro ORIAS (obligation d'affichage)." },
        { key: KEYS.activeLanguages, value: activeLangs, category: 'cms.i18n', description: 'Langues actives sur le site (CSV de codes).' },
      ]

      // Upsert séquentiel (l'API ne supporte pas le batch).
      for (const p of payload) {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
        if (!res.ok) throw new Error(`Échec enregistrement ${p.key}`)
      }

      setPublierModalOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="view" id="cms">
        <p className="field-hint">Chargement du contenu…</p>
      </section>
    )
  }

  return (
    <section className="view" id="cms">
      <div className="info-band">
        <div className="imark">i</div>
        <div>
          Modifiez tout le contenu du site public depuis ici. Les changements s&apos;appliquent
          directement aux pages en ligne, dans les 6 langues.
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
            Le renommer met à jour tous les templates d'emails et paramètres en une seule transaction.
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
          </div>

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
          </div>
        </div>

        <div>
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
              <div className="fg" style={{ marginBottom: 0 }}>
                <label>Numéro ORIAS</label>
                <input value={coord.orias} onChange={(e) => setCoord({ ...coord, orias: e.target.value })} />
              </div>
            </div>
          </div>

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
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={() => setPublierModalOpen(true)} disabled={saving}>
        {saving ? 'Publication…' : 'Publier les modifications'}
      </button>

      <Modal
        isOpen={publierModalOpen}
        onClose={() => setPublierModalOpen(false)}
        title="Publier les modifications"
      >
        <p className="field-hint">
          Les modifications seront appliquées immédiatement sur le site public. Tous les visiteurs verront la nouvelle version.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
          Vous allez publier : titre du Hero, sous-titre, boutons, 4 services, coordonnées (téléphone, WhatsApp, email, ORIAS) et les langues actives.
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setPublierModalOpen(false)} disabled={saving}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={publish} disabled={saving}>
            {saving ? 'Publication…' : 'Confirmer la publication'}
          </button>
        </div>
      </Modal>
    </section>
  )
}
