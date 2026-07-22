'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Icon } from './Icon'

// =============================================================================
// Login — formulaire de connexion NextAuth v5 (Credentials Provider).
// =============================================================================
// Utilise signIn('credentials', { redirect: false }) — pattern idiomatique
// NextAuth v5. En cas de succès, router.push('/') recharge la page et le
// <AdminPage> via useSession() affiche le CRM.
//
// Ce composant est rendu par /login/page.tsx (server component qui redirige
// vers / si déjà authentifié).

export function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // twoFactorRequired devient true après check-2fa positif → affiche le champ TOTP.
  const [twoFactorRequired, setTwoFactorRequired] = useState(false)

  // ---------------------------------------------------------------------------
  // Soumission — signIn() idiomatique next-auth/react.
  // ---------------------------------------------------------------------------
  // 1. POST /api/auth/check-2fa → si twoFactorRequired, on bascule en mode 2FA
  //    (sans appeler signIn) et l'utilisateur saisit son code TOTP.
  // 2. Quand l'utilisateur soumet avec code (ou si pas de 2FA), on appelle
  //    signIn('credentials', { email, password, totp? }).
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    void remember

    try {
      // Si on n'est pas encore en mode 2FA → on check d'abord si 2FA requise.
      if (!twoFactorRequired) {
        const checkRes = await fetch('/api/auth/check-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (checkRes.ok) {
          const json = await checkRes.json()
          const required = (json.data ?? json)?.twoFactorRequired === true
          if (required) {
            // Affiche le champ TOTP sans appeler signIn() — l'utilisateur
            // doit saisir son code avant qu'on tente l'authentification.
            setTwoFactorRequired(true)
            setLoading(false)
            return
          }
        }
        // check-2fa a échoué ou pas de 2FA → on continue vers signIn().
      }

      const res = await signIn('credentials', {
        email,
        password,
        ...(twoFactorRequired ? { totp } : {}),
        redirect: false,
      })

      if (!res || res.error) {
        setError(
          twoFactorRequired
            ? 'Code TOTP invalide. Vérifiez votre app et réessayez.'
            : 'Email ou mot de passe incorrect.',
        )
        setLoading(false)
        return
      }

      // Succès : le cookie de session est posé. On redirige vers / pour
      // que <AdminPage> via useSession() affiche le CRM.
      router.push('/')
      router.refresh()
    } catch {
      setError('Erreur réseau. Réessayez.')
      setLoading(false)
    }
  }

  // Reset du mode 2FA si l'utilisateur change d'email ou de password.
  const handleEmailChange = (v: string) => {
    setEmail(v)
    if (twoFactorRequired) setTwoFactorRequired(false)
  }
  const handlePasswordChange = (v: string) => {
    setPassword(v)
    if (twoFactorRequired) setTwoFactorRequired(false)
  }

  return (
    <div className="login-page">
      {/* LEFT — Brand panel */}
      <div className="login-brand">
        <div className="login-brand-content">
          <div className="login-brand-logo">
            Kredi<span>x</span>
          </div>
          <h2>Plateforme de gestion<br />pour courtiers en crédit</h2>
          <p>
            Gérez vos prospects, dossiers, agents IA et tout votre flux client depuis un seul espace sécurisé.
          </p>
          <div className="login-brand-features">
            <div className="login-feature">
              <div className="login-feature-ico"><Icon name="bar-chart" size={20} /></div>
              <span>Suivi temps réel des dossiers et prospects</span>
            </div>
            <div className="login-feature">
              <div className="login-feature-ico"><Icon name="cpu" size={20} /></div>
              <span>Agents IA pour automatiser vos relances</span>
            </div>
            <div className="login-feature">
              <div className="login-feature-ico"><Icon name="shield" size={20} /></div>
              <span>Données chiffrées et sécurité renforcée</span>
            </div>
          </div>
        </div>
        <div className="login-brand-footer">
          © 2026 Kredix — Tous droits réservés
        </div>
      </div>

      {/* RIGHT — Form panel */}
      <div className="login-form-side">
        <div className="login-card">
          <div className="login-card-logo">
            Kredi<span>x</span>
          </div>
          <div className="login-subtitle">Connexion à votre espace administrateur</div>

          <div className={`login-error${error ? ' show' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error ?? 'Email ou mot de passe incorrect.'}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="login-fg">
              <label>Adresse email</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="admin@kredix.local"
                  required
                  autoComplete="email"
                  autoFocus
                  disabled={twoFactorRequired}
                />
              </div>
            </div>

            <div className="login-fg">
              <label>Mot de passe</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={twoFactorRequired}
                />
              </div>
            </div>

            {twoFactorRequired && (
              <div className="login-fg">
                <label>Code d&apos;authentification (2FA)</label>
                <div className="login-input-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <small style={{ display: 'block', marginTop: 6, color: '#6b7280', fontSize: 12 }}>
                  Saisissez le code à 6 chiffres depuis votre app d&apos;authentification.
                </small>
              </div>
            )}

            <div className="login-options">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Se souvenir de moi
              </label>
              <a>Mot de passe oublié ?</a>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="login-credentials">
            <div className="login-credentials-title">
              <Icon name="key" size={14} /> Identifiants de démonstration
            </div>
            <div className="login-credentials-row">
              <b>Email</b>
              <code onClick={() => setEmail('admin@kredix.local')}>admin@kredix.local</code>
            </div>
            <div className="login-credentials-row">
              <b>Mot de passe</b>
              <code onClick={() => setPassword('admin123')}>admin123</code>
            </div>
          </div>

          <div className="login-back">
            <a>← Retour au site Kredix.fr</a>
          </div>
        </div>
      </div>
    </div>
  )
}
