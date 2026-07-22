'use client'

import { useState, useRef, useEffect } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'

interface TopbarProps {
  title: string
  subtitle: string
  onProfileClick?: () => void
  onLogout?: () => void
  onMenuToggle?: () => void
  soundEnabled?: boolean
}

interface NotifItem {
  id: number
  type: 'new' | 'success' | 'info'
  icon: string
  title: string
  text: string
  time: string
  read: boolean
}

export function Topbar({ title, subtitle, onProfileClick, onLogout, onMenuToggle, soundEnabled = true }: TopbarProps) {
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [newDossierModalOpen, setNewDossierModalOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)

  const [notifs, setNotifs] = useState<NotifItem[]>([
    { id: 1, type: 'new', icon: 'user-plus', title: 'Nouveau prospect', text: 'Marie Dupont a soumis une demande de crédit immobilier de 210 000€.', time: 'Il y a 5 min', read: false },
    { id: 2, type: 'success', icon: 'check-circle', title: 'Dossier validé', text: 'Le dossier de Jean Martin a été accepté par la banque Crédit Mutuel.', time: 'Il y a 1h', read: false },
    { id: 3, type: 'info', icon: 'bot', title: 'Agent IA terminé', text: 'L\'agent Emailing a envoyé 47 emails de relance automatiquement.', time: 'Il y a 3h', read: false },
    { id: 4, type: 'info', icon: 'bar-chart', title: 'Audit SEO disponible', text: 'Le rapport SEO hebdomadaire est prêt à être consulté.', time: 'Hier', read: true },
  ])

  const unreadCount = notifs.filter((n) => !n.read).length

  const playNotifSound = () => {
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
    } catch (e) {
      // AudioContext non supporté
    }
  }

  // Simule une nouvelle notification après 15s
  // Effet one-shot au montage : deps vides intentionnels (playNotifSound est stable).
  useEffect(() => {
    const timer = setTimeout(() => {
      const newNotif: NotifItem = {
        id: Date.now(),
        type: 'new',
        icon: 'alert-triangle',
        title: 'Dossier urgent',
        text: 'Le dossier de Sophie Leroy est en attente depuis plus de 48h.',
        time: 'À l\'instant',
        read: false,
      }
      setNotifs((prev) => [newNotif, ...prev])
      playNotifSound()
    }, 15000)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markAllRead = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleNotifClick = (id: number) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  // Ferme les dropdowns au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.notif-wrap')) setNotifOpen(false)
      if (!target.closest('.avatar-wrap')) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="notif-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="notif-dropdown-head">
                  <b>Notifications</b>
                  <span onClick={markAllRead}>Tout marquer lu</span>
                </div>
                <div className="notif-list">
                  {notifs.length === 0 ? (
                    <div className="notif-empty">Aucune notification</div>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item${n.read ? '' : ' unread'}`}
                        onClick={() => handleNotifClick(n.id)}
                      >
                        <div className={`notif-ico ${n.type}`}><Icon name={n.icon} size={18} /></div>
                        <div className="notif-content">
                          <b>{n.title}</b>
                          <p>{n.text}</p>
                          <small>{n.time}</small>
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
            <div className="avatar" style={{ cursor: 'pointer' }} onClick={() => { setAvatarOpen(!avatarOpen); setNotifOpen(false) }}>TB</div>

            {avatarOpen && (
              <div className="avatar-menu" onClick={(e) => e.stopPropagation()}>
                <div className="avatar-menu-header">
                  <b>Thomas Bernard</b>
                  <small>admin@kredix.local</small>
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
          Sélectionnez les données à exporter au format Excel. L&apos;export inclut tous les filtres appliqués.
        </p>
        <div className="modal-fg">
          <label>Type d&apos;export</label>
          <select defaultValue="full">
            <option>Toutes les données</option>
            <option>Dossiers uniquement</option>
            <option>Prospects uniquement</option>
            <option>Clients uniquement</option>
          </select>
        </div>
        <div className="modal-fg">
          <label>Format</label>
          <select defaultValue="xlsx">
            <option>Excel (.xlsx)</option>
            <option>CSV (.csv)</option>
            <option>PDF (.pdf)</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setExportModalOpen(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={() => { alert('Export simulé — fichier généré avec les filtres actuels'); setExportModalOpen(false) }}>Exporter</button>
        </div>
      </Modal>

      <Modal isOpen={newDossierModalOpen} onClose={() => setNewDossierModalOpen(false)} title="Nouveau dossier">
        <p className="field-hint">
          Créez un nouveau dossier de financement. Les informations seront saisies dans le formulaire du simulateur.
        </p>
        <div className="modal-fg">
          <label>Nom du prospect</label>
          <input type="text" placeholder="Ex : Marie Dupont" />
        </div>
        <div className="modal-fg">
          <label>Email</label>
          <input type="email" placeholder="marie.dupont@email.com" />
        </div>
        <div className="modal-fg">
          <label>Type de crédit</label>
          <select>
            <option>Prêt immobilier</option>
            <option>Prêt à la consommation</option>
            <option>Rachat de crédits</option>
            <option>Prêt professionnel</option>
          </select>
        </div>
        <div className="modal-fg">
          <label>Montant souhaité (€)</label>
          <input type="number" placeholder="Ex : 210000" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setNewDossierModalOpen(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={() => { alert('Dossier créé — redirigé vers le formulaire simulateur'); setNewDossierModalOpen(false) }}>Créer le dossier</button>
        </div>
      </Modal>
    </>
  )
}