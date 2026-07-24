'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from './Modal'
import { Icon } from './Icon'

interface TopbarProps {
  title: string
  subtitle: string
  onProfileClick?: () => void
  onLogout?: () => void
  onMenuToggle?: () => void
}

// -----------------------------------------------------------------------------
// Types notification (alignés sur le modèle Prisma Notification)
// -----------------------------------------------------------------------------

interface NotifItem {
  id: string
  type: string
  severity: 'info' | 'success' | 'warning' | 'danger'
  icon: string
  title: string
  message: string
  linkUrl: string | null
  readAt: string | null
  createdAt: string
}

// Mapping severity → classe CSS notif-ico (compat avec l'existant)
function severityToClass(severity: string): string {
  switch (severity) {
    case 'success': return 'success'
    case 'warning':
    case 'danger': return 'new'
    default: return 'info'
  }
}

// Formatage relatif du temps
function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'À l\'instant'
  const min = Math.floor(sec / 60)
  if (min < 60) return `Il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `Il y a ${hr}h`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'Hier'
  return `Il y a ${day} jours`
}

export function Topbar({ title, subtitle, onProfileClick, onLogout, onMenuToggle }: TopbarProps) {
  const router = useRouter()
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [newDossierModalOpen, setNewDossierModalOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotifItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminInitials, setAdminInitials] = useState('')
  const [exportType, setExportType] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [dossierForm, setDossierForm] = useState({
    fullName: '', email: '', phone: '', city: '',
    loanType: 'immo', amount: '', durationYears: '20',
    employmentStatus: 'CDI',
  })
  const [dossierError, setDossierError] = useState<string | null>(null)
  const [dossierSaving, setDossierSaving] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const lastNotifIdRef = useRef<string | null>(null)

  // -------------------------------------------------------------------------
  // Fetch profil (pour le nom/email/avatar + préférence son)
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!res?.data) return
        const d = res.data
        setAdminName(d.displayName || 'Admin')
        setAdminEmail(d.email || '')
        const parts = (d.displayName || 'A').split(' ')
        const initials = parts.map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()
        setAdminInitials(initials)
        setSoundEnabled(d.notifications?.notif_sound !== false)
      })
      .catch(() => {})
  }, [])

  // -------------------------------------------------------------------------
  // Son de notification (WebAudio)
  // -------------------------------------------------------------------------

  const playNotifSound = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const ctx = audioRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16)

      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // AudioContext non supporté
    }
  }, [soundEnabled])

  // -------------------------------------------------------------------------
  // Polling : récupère le compteur non lues toutes les 30s
  // -------------------------------------------------------------------------

  useEffect(() => {
    const fetchUnreadCount = () => {
      fetch('/api/notifications/unread-count')
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.data?.count !== undefined) {
            setUnreadCount(res.data.count)
          }
        })
        .catch(() => {})
    }

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  // -------------------------------------------------------------------------
  // Fetch liste quand on ouvre le dropdown
  // -------------------------------------------------------------------------

  const loadNotifs = useCallback(() => {
    fetch('/api/notifications?limit=30')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!res?.data) return
        const items: NotifItem[] = res.data
        // Détection de nouvelle notif pour le son
        if (items.length > 0) {
          const newestId = items[0].id
          if (lastNotifIdRef.current && newestId !== lastNotifIdRef.current) {
            // Son seulement si la plus récente est non lue
            if (!items[0].readAt) playNotifSound()
          }
          lastNotifIdRef.current = newestId
        }
        setNotifs(items)
      })
      .catch(() => {})
  }, [playNotifSound])

  useEffect(() => {
    if (notifOpen) loadNotifs()
  }, [notifOpen, loadNotifs])

  // -------------------------------------------------------------------------
  // Actions : mark as read
  // -------------------------------------------------------------------------

  const markAllRead = async () => {
    // Optimistic UI
    setNotifs((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    setUnreadCount(0)
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
    } catch {
      // Silencieux — l'UI optimiste reste
    }
  }

  const handleNotifClick = async (notif: NotifItem) => {
    // Marque comme lu (optimistic)
    if (!notif.readAt) {
      setNotifs((prev) => prev.map((n) => (n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
      fetch(`/api/notifications/${notif.id}`, { method: 'PATCH' }).catch(() => {})
    }
    // Navigation si linkUrl
    if (notif.linkUrl) {
      setNotifOpen(false)
      router.push(notif.linkUrl)
    }
  }

  // -------------------------------------------------------------------------
  // Ferme les dropdowns au clic extérieur
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.notif-wrap')) setNotifOpen(false)
      if (!target.closest('.avatar-wrap')) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // -------------------------------------------------------------------------

  return (
    <>
      <div className="topbar">
        {/* Burger menu — visible uniquement sur mobile (<768px) */}
        <button className="burger-btn" onClick={onMenuToggle} aria-label="Ouvrir le menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="topbar-titles">
          <h1 id="pageTitle">{title}</h1>
          <div className="sub" id="pageSub">{subtitle}</div>
        </div>
        <div className="top-actions">
          <button className="btn btn-ghost" onClick={() => setExportModalOpen(true)}>Exporter</button>
          <button className="btn btn-primary" onClick={() => setNewDossierModalOpen(true)}>+ Nouveau dossier</button>

          {/* Notifications */}
          <div className="notif-wrap">
            <button className="notif-btn" onClick={() => { setNotifOpen(!notifOpen); setAvatarOpen(false) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="notif-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="notif-dropdown-head">
                  <b>Notifications</b>
                  {unreadCount > 0 && <span onClick={markAllRead}>Tout marquer lu</span>}
                </div>
                <div className="notif-list">
                  {notifs.length === 0 ? (
                    <div className="notif-empty">Aucune notification</div>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item${n.readAt ? '' : ' unread'}`}
                        onClick={() => handleNotifClick(n)}
                        style={{ cursor: n.linkUrl ? 'pointer' : 'default' }}
                      >
                        <div className={`notif-ico ${severityToClass(n.severity)}`}><Icon name={n.icon} size={18} /></div>
                        <div className="notif-content">
                          <b>{n.title}</b>
                          <p>{n.message}</p>
                          <small>{formatTime(n.createdAt)}</small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar avec menu déroulant */}
          <div className="avatar-wrap">
            <div className="avatar" style={{ cursor: 'pointer' }} onClick={() => { setAvatarOpen(!avatarOpen); setNotifOpen(false) }}>{adminInitials || 'A'}</div>

            {avatarOpen && (
              <div className="avatar-menu" onClick={(e) => e.stopPropagation()}>
                <div className="avatar-menu-header">
                  <b>{adminName || 'Administrateur'}</b>
                  <small>{adminEmail || ''}</small>
                </div>
                <button className="avatar-menu-item" onClick={() => { onProfileClick?.(); setAvatarOpen(false) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Mon profil
                </button>
                <button className="avatar-menu-item" onClick={() => { onProfileClick?.(); setAvatarOpen(false) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Paramètres du compte
                </button>
                <div style={{ borderTop: '1px solid var(--line-soft)', margin: '4px 0' }}></div>
                <button className="avatar-menu-item danger" onClick={() => { onLogout?.(); setAvatarOpen(false) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={exportModalOpen} onClose={() => setExportModalOpen(false)} title="Exporter les données">
        <p className="field-hint">
          Sélectionnez les données à exporter. Le fichier CSV est téléchargé immédiatement
          et s&apos;ouvre directement dans Excel.
        </p>
        <div className="modal-fg">
          <label>Type d&apos;export</label>
          <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
            <option value="all">Toutes les données</option>
            <option value="leads">Prospects uniquement</option>
            <option value="clients">Clients uniquement</option>
          </select>
        </div>
        <div className="modal-fg">
          <label>Format</label>
          <select defaultValue="csv">
            <option>CSV (compatible Excel)</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setExportModalOpen(false)}>Annuler</button>
          <button
            className="btn btn-primary"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                const res = await fetch(`/api/leads/export?type=${exportType}`)
                if (!res.ok) throw new Error('Export échec')
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                const disposition = res.headers.get('Content-Disposition') ?? ''
                const match = disposition.match(/filename="(.+)"/)
                a.download = match?.[1] ?? `export-${exportType}.csv`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                setExportModalOpen(false)
              } catch {
                alert('Erreur lors de l\'export. Réessayez.')
              } finally {
                setExporting(false)
              }
            }}
          >
            {exporting ? 'Export en cours…' : 'Exporter'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={newDossierModalOpen} onClose={() => { setNewDossierModalOpen(false); setDossierError(null) }} title="Nouveau dossier">
        <p className="field-hint">
          Créez un nouveau dossier de prospect. Le lead sera créé en statut « Nouveau »
          et assigné à votre compte.
        </p>
        {dossierError && (
          <div style={{ background: 'rgba(192,57,43,0.08)', color: '#c0392b', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {dossierError}
          </div>
        )}
        <div className="modal-fg">
          <label>Nom complet *</label>
          <input
            type="text"
            placeholder="Ex : Marie Dupont"
            value={dossierForm.fullName}
            onChange={(e) => setDossierForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </div>
        <div className="modal-fg">
          <label>Email</label>
          <input
            type="email"
            placeholder="marie.dupont@email.com"
            value={dossierForm.email}
            onChange={(e) => setDossierForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="modal-fg">
          <label>Téléphone *</label>
          <input
            type="tel"
            placeholder="06 12 34 56 78"
            value={dossierForm.phone}
            onChange={(e) => setDossierForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="modal-fg">
          <label>Ville *</label>
          <input
            type="text"
            placeholder="Paris"
            value={dossierForm.city}
            onChange={(e) => setDossierForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-fg" style={{ flex: 1 }}>
            <label>Type de crédit *</label>
            <select
              value={dossierForm.loanType}
              onChange={(e) => setDossierForm((f) => ({ ...f, loanType: e.target.value }))}
            >
              <option value="immo">Immobilier</option>
              <option value="conso">Consommation</option>
              <option value="rachat">Rachat de crédits</option>
              <option value="pro">Professionnel</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div className="modal-fg" style={{ flex: 1 }}>
            <label>Montant (€) *</label>
            <input
              type="number"
              placeholder="210000"
              value={dossierForm.amount}
              onChange={(e) => setDossierForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-fg" style={{ flex: 1 }}>
            <label>Durée (années)</label>
            <input
              type="number"
              placeholder="20"
              value={dossierForm.durationYears}
              onChange={(e) => setDossierForm((f) => ({ ...f, durationYears: e.target.value }))}
            />
          </div>
          <div className="modal-fg" style={{ flex: 1 }}>
            <label>Situation professionnelle</label>
            <select
              value={dossierForm.employmentStatus}
              onChange={(e) => setDossierForm((f) => ({ ...f, employmentStatus: e.target.value }))}
            >
              <option>CDI</option>
              <option>CDD</option>
              <option>Indépendant</option>
              <option>Fonctionnaire</option>
              <option>Auto-entrepreneur</option>
              <option>Retraité</option>
              <option>Autre</option>
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { setNewDossierModalOpen(false); setDossierError(null) }}>Annuler</button>
          <button
            className="btn btn-primary"
            disabled={dossierSaving}
            onClick={async () => {
              // Validation client
              if (!dossierForm.fullName.trim()) { setDossierError('Le nom est obligatoire'); return }
              if (!dossierForm.phone.trim()) { setDossierError('Le téléphone est obligatoire'); return }
              if (!dossierForm.city.trim()) { setDossierError('La ville est obligatoire'); return }
              if (!dossierForm.amount || parseInt(dossierForm.amount) < 1) { setDossierError('Le montant est invalide'); return }

              // Parse nom → firstName / lastName
              const parts = dossierForm.fullName.trim().split(/\s+/)
              const firstName = parts[0] || ''
              const lastName = parts.slice(1).join(' ') || ''

              setDossierSaving(true)
              setDossierError(null)
              try {
                const res = await fetch('/api/leads', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    firstName,
                    lastName,
                    email: dossierForm.email || undefined,
                    phone: dossierForm.phone,
                    city: dossierForm.city,
                    loanType: dossierForm.loanType,
                    amount: parseInt(dossierForm.amount, 10),
                    durationYears: parseInt(dossierForm.durationYears, 10) || 20,
                    employmentStatus: dossierForm.employmentStatus,
                  }),
                })
                if (!res.ok) {
                  const err = await res.json().catch(() => null)
                  throw new Error(err?.error || `HTTP ${res.status}`)
                }
                // Reset form + close
                setDossierForm({ fullName: '', email: '', phone: '', city: '', loanType: 'immo', amount: '', durationYears: '20', employmentStatus: 'CDI' })
                setNewDossierModalOpen(false)
                // Navigate to contacts to see the new lead
                router.push('/contacts')
              } catch (e) {
                setDossierError(e instanceof Error ? e.message : 'Erreur de création')
              } finally {
                setDossierSaving(false)
              }
            }}
          >
            {dossierSaving ? 'Création…' : 'Créer le dossier'}
          </button>
        </div>
      </Modal>
    </>
  )
}
