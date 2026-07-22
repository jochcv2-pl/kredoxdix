'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Modal } from '@/components/Modal'

// =============================================================================
// Types — reflet exact de la réponse /api/profile
// =============================================================================

interface ProfileData {
  id: string
  displayName: string
  email: string
  role: string
  isActive: boolean
  phone: string
  lastLoginAt: string | null
  notifications: Record<string, boolean>
  twoFactorEnabled: boolean
}

interface Setup2faResponse {
  secret: string
  otpauthUrl: string
  qrDataUrl: string
}

// Les 5 clés de notifications (alignées sur NOTIF_KEYS côté serveur).
const NOTIF_LABELS: { key: string; label: string; hint: string }[] = [
  { key: 'notif_new_prospect', label: 'Nouveau prospect', hint: 'Notification à chaque nouveau prospect' },
  { key: 'notif_urgent_file', label: 'Dossier urgent', hint: 'Alerte pour les dossiers en attente > 48h' },
  { key: 'notif_agent_activity', label: 'Activité des agents IA', hint: 'Rapport quotidien des agents' },
  { key: 'notif_seo_audit', label: 'Audit SEO', hint: "Résultats d'audit hebdomadaire" },
  { key: 'notif_sound', label: 'Son de notification', hint: 'Jouer un son aux nouvelles notifications' },
]

// =============================================================================
// Composant principal
// =============================================================================

export default function Profil() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Édition locale (displayName/email/phone + notifications).
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notifs, setNotifs] = useState<Record<string, boolean>>({})
  // Sécurité : mot de passe requis pour valider un changement d'email.
  const [emailPassword, setEmailPassword] = useState('')

  // ---------------------------------------------------------------------------
  // Chargement initial
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/profile')
        if (!res.ok) throw new Error('Échec chargement profil (HTTP ' + res.status + ')')
        const json = await res.json()
        const profile: ProfileData = json.data ?? json
        if (cancelled) return
        setData(profile)
        setDisplayName(profile.displayName)
        setEmail(profile.email)
        setPhone(profile.phone)
        setNotifs(profile.notifications ?? {})
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
  // Save — PATCH /api/profile avec champs modifiés + notifications complètes
  // ---------------------------------------------------------------------------

  const saveProfile = async () => {
    setSaving(true)
    setError(null)
    try {
      const emailChanged = data ? email !== data.email : false
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email,
          phone,
          notifications: notifs,
          // currentPassword envoyé uniquement si l'email a changé.
          ...(emailChanged ? { currentPassword: emailPassword } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? `Échec sauvegarde (HTTP ${res.status})`)
      }
      const json = await res.json()
      const updated: ProfileData = json.data ?? json
      setData(updated)
      setDisplayName(updated.displayName)
      setEmail(updated.email)
      setPhone(updated.phone)
      setNotifs(updated.notifications ?? {})
      setEmailPassword('')
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  const toggleNotif = (key: string) => {
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ---------------------------------------------------------------------------
  // Callbacks 2FA : après enable/disable, on refresh l'état `data`.
  // ---------------------------------------------------------------------------

  const on2faChanged = async (enabled: boolean) => {
    setData((prev) => (prev ? { ...prev, twoFactorEnabled: enabled } : prev))
    // Resync complète via GET /api/profile pour coherence.
    try {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const json = await res.json()
        const updated: ProfileData = json.data ?? json
        setData(updated)
      }
    } catch {
      /* non bloquant */
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <section className="view" id="profil">
        <p className="field-hint">Chargement du profil…</p>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="view" id="profil">
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b' }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error ?? 'Profil introuvable'}</div>
        </div>
      </section>
    )
  }

  // Initiales de l'avatar (max 2 lettres).
  const initials = data.displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')

  // Formatage date dernière connexion.
  const lastLoginLabel = data.lastLoginAt
    ? new Date(data.lastLoginAt).toLocaleString('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
      })
    : 'Jamais'

  return (
    <section className="view" id="profil">
      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      {/* Header profil */}
      <div className="profile-header">
        <div className="profile-avatar-lg">{initials || '?'}</div>
        <div>
          <h2>{data.displayName}</h2>
          <div className="profile-role">
            {data.role === 'admin' ? 'Administrateur' : data.role} — Courtier senior
          </div>
          <div className="profile-meta">
            <span><Icon name="mail" size={14} /> {data.email}</span>
            <span><Icon name="phone" size={14} /> {data.phone || '—'}</span>
            <span><Icon name="award" size={14} /> ORIAS 00000000</span>
          </div>
        </div>
        {savedAt && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--green)' }}>
            <Icon name="check" size={12} /> Enregistré à {savedAt.toLocaleTimeString('fr-FR')}
          </span>
        )}
      </div>

      <div className="grid-2">
        {/* Informations personnelles */}
        <div className="profile-section">
          <div className="profile-section-head">
            <h3>Informations personnelles</h3>
          </div>
          <div className="profile-section-body">
            <div className="modal-fg">
              <label>Nom complet</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            </div>
            <div className="modal-fg">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
              {data && email !== data.email && (
                <div className="modal-fg" style={{ marginTop: 8 }}>
                  <label>Mot de passe actuel <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    maxLength={128}
                    placeholder="Requis pour changer l'email"
                    autoComplete="current-password"
                  />
                  <small style={{ opacity: 0.7 }}>Confirmez votre mot de passe pour valider le changement d'email.</small>
                </div>
              )}
            </div>
            <div className="modal-fg">
              <label>Téléphone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+33 6 00 00 00 00" />
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 8 }}
              onClick={saveProfile}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
          </div>
        </div>

        {/* Colonne droite : Notifications + Sécurité */}
        <div>
          {/* Notifications */}
          <div className="profile-section">
            <div className="profile-section-head">
              <h3>Notifications</h3>
            </div>
            <div className="profile-section-body">
              {NOTIF_LABELS.map(({ key, label, hint }) => {
                const val = notifs[key] ?? true
                return (
                  <div className="pref-row" key={key}>
                    <div className="pref-label">
                      <b>{label}</b>
                      <small>{hint}</small>
                    </div>
                    <div className="toggle" onClick={() => toggleNotif(key)} role="switch" aria-checked={val} tabIndex={0}>
                      <div className={`toggle-track${val ? '' : ' off'}`}>
                        <div className="toggle-knob"></div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <p className="field-hint" style={{ marginTop: 10 }}>
                Les changements sont appliqués au clic sur « Enregistrer les modifications ».
              </p>
            </div>
          </div>

          {/* Statut compte */}
          <div className="profile-section">
            <div className="profile-section-head">
              <h3>Statut du compte</h3>
            </div>
            <div className="profile-section-body">
              <div className="set-row">
                <div className="set-label">
                  <b>Rôle</b>
                  <small>Niveau d&apos;accès</small>
                </div>
                <span className="pill-on">{data.role === 'admin' ? 'Administrateur' : data.role}</span>
              </div>
              <div className="set-row">
                <div className="set-label">
                  <b>Dernière connexion</b>
                  <small>{lastLoginLabel}</small>
                </div>
                <span className="set-val">{data.isActive ? 'Actif' : 'Inactif'}</span>
              </div>
            </div>
          </div>

          {/* Sécurité — mot de passe + 2FA */}
          <SecuritySection
            twoFactorEnabled={data.twoFactorEnabled}
            on2faChanged={on2faChanged}
            onError={(msg) => setError(msg)}
          />
        </div>
      </div>
    </section>
  )
}

// =============================================================================
// SecuritySection — Change password + 2FA TOTP
// =============================================================================

function SecuritySection({
  twoFactorEnabled,
  on2faChanged,
  onError,
}: {
  twoFactorEnabled: boolean
  on2faChanged: (enabled: boolean) => void | Promise<void>
  onError: (msg: string) => void
}) {
  // Change password state
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  // 2FA setup state
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupData, setSetupData] = useState<Setup2faResponse | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  // 2FA disable state
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePwd, setDisablePwd] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableLoading, setDisableLoading] = useState(false)

  // ---- Change password ----
  const submitPassword = async () => {
    if (newPwd !== confirmPwd) {
      onError('Les mots de passe ne correspondent pas.')
      return
    }
    if (newPwd.length < 8) {
      onError('Le nouveau mot de passe doit faire au moins 8 caractères.')
      return
    }
    setPwdLoading(true)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPwd,
          newPassword: newPwd,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? `Échec (HTTP ${res.status})`)
      }
      // Reset champs
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setPwdLoading(false)
    }
  }

  // ---- 2FA setup : POST /api/profile/2fa/setup ----
  const openSetup = async () => {
    setSetupOpen(true)
    setSetupCode('')
    setSetupData(null)
    try {
      const res = await fetch('/api/profile/2fa/setup', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Échec génération QR')
      setSetupData(json.data ?? json)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSetupOpen(false)
    }
  }

  // ---- 2FA enable : POST /api/profile/2fa/enable { secret, code } ----
  const submitEnable2fa = async () => {
    if (!setupData) return
    if (!/^\d{6}$/.test(setupCode)) {
      onError('Code TOTP invalide (6 chiffres).')
      return
    }
    setSetupLoading(true)
    try {
      const res = await fetch('/api/profile/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: setupData.secret,
          code: setupCode,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? 'Code TOTP invalide')
      }
      setSetupOpen(false)
      setSetupData(null)
      setSetupCode('')
      await on2faChanged(true)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSetupLoading(false)
    }
  }

  // ---- 2FA disable : POST /api/profile/2fa/disable { password, code } ----
  const submitDisable2fa = async () => {
    if (!/^\d{6}$/.test(disableCode)) {
      onError('Code TOTP invalide (6 chiffres).')
      return
    }
    setDisableLoading(true)
    try {
      const res = await fetch('/api/profile/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: disablePwd,
          code: disableCode,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? 'Désactivation échouée')
      }
      setDisableOpen(false)
      setDisablePwd('')
      setDisableCode('')
      await on2faChanged(false)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setDisableLoading(false)
    }
  }

  return (
    <div className="profile-section">
      <div className="profile-section-head">
        <h3>Sécurité</h3>
      </div>
      <div className="profile-section-body">
        {/* --- Changer mot de passe --- */}
        <div className="modal-fg">
          <label>Mot de passe actuel</label>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        <div className="modal-fg">
          <label>Nouveau mot de passe (min. 8 caractères)</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </div>
        <div className="modal-fg">
          <label>Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          onClick={submitPassword}
          disabled={pwdLoading || !currentPwd || !newPwd || !confirmPwd}
        >
          {pwdLoading ? 'Modification…' : 'Changer le mot de passe'}
        </button>

        <div style={{ borderTop: '1px solid var(--line-soft)', margin: '18px 0' }}></div>

        {/* --- 2FA TOTP --- */}
        <div className="set-row">
          <div className="set-label">
            <b>Double authentification (2FA)</b>
            <small>
              Ajoute une vérification par code temporaire à chaque connexion.
              Compatible Google Authenticator, Authy, 1Password…
            </small>
          </div>
          {twoFactorEnabled ? (
            <span className="pill-on">Activée</span>
          ) : (
            <span className="pill-off">Désactivée</span>
          )}
        </div>

        {twoFactorEnabled ? (
          <button
            className="btn btn-ghost"
            style={{ marginTop: 8, color: 'var(--red)' }}
            onClick={() => { setDisableOpen(true); setDisablePwd(''); setDisableCode('') }}
          >
            Désactiver la 2FA
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            onClick={openSetup}
          >
            Activer la 2FA
          </button>
        )}
      </div>

      {/* --- Modal setup 2FA : QR + code --- */}
      <Modal
        isOpen={setupOpen}
        onClose={() => { setSetupOpen(false); setSetupData(null); setSetupCode('') }}
        title="Activer la double authentification"
      >
        {!setupData ? (
          <p className="field-hint">Génération du QR code…</p>
        ) : (
          <>
            <p className="field-hint">
              Scannez ce QR code avec votre app d&apos;authentification, puis saisissez
              le code à 6 chiffres affiché.
            </p>
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrDataUrl}
                alt="QR code 2FA"
                style={{ width: 220, height: 220, borderRadius: 8 }}
              />
            </div>
            <div className="modal-fg">
              <label>Code secret (à saisir manuellement si le QR ne marche pas)</label>
              <code style={{
                display: 'block',
                padding: '8px 10px',
                background: 'var(--bg)',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 13,
                wordBreak: 'break-all',
              }}>{setupData.secret}</code>
            </div>
            <div className="modal-fg">
              <label>Code à 6 chiffres</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => { setSetupOpen(false); setSetupData(null); setSetupCode('') }}
                disabled={setupLoading}
              >
                Annuler
              </button>
              <button
                className="btn btn-primary"
                onClick={submitEnable2fa}
                disabled={setupLoading || !/^\d{6}$/.test(setupCode)}
              >
                {setupLoading ? 'Activation…' : 'Confirmer l\'activation'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* --- Modal disable 2FA --- */}
      <Modal
        isOpen={disableOpen}
        onClose={() => { setDisableOpen(false); setDisablePwd(''); setDisableCode('') }}
        title="Désactiver la 2FA"
      >
        <p className="field-hint">
          Pour des raisons de sécurité, confirmez votre mot de passe et un code
          TOTP valide. Cette action désactivera la double authentification.
        </p>
        <div className="modal-fg">
          <label>Mot de passe</label>
          <input
            type="password"
            value={disablePwd}
            onChange={(e) => setDisablePwd(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            autoFocus
          />
        </div>
        <div className="modal-fg">
          <label>Code TOTP actuel</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
          />
        </div>
        <div className="modal-actions">
          <button
            className="btn btn-ghost"
            onClick={() => { setDisableOpen(false); setDisablePwd(''); setDisableCode('') }}
            disabled={disableLoading}
          >
            Annuler
          </button>
          <button
            className="btn btn-primary"
            style={{ background: 'var(--red)' }}
            onClick={submitDisable2fa}
            disabled={disableLoading || !disablePwd || !/^\d{6}$/.test(disableCode)}
          >
            {disableLoading ? 'Désactivation…' : 'Désactiver la 2FA'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
