'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'
import Dashboard from '@/views/dashboard/page'
import Contacts from '@/views/contacts/page'
import Clients from '@/views/clients/page'
import Dossiers from '@/views/dossiers/page'
import Taux from '@/views/taux/page'
import Emails from '@/views/emails/page'
import Documents from '@/views/documents/page'
import Campaigns from '@/views/campaigns/page'
import EmailHistory from '@/views/email-history/page'
import CMS from '@/views/cms/page'
import Testimonials from '@/views/testimonials/page'
import Content from '@/views/content/page'
import Legal from '@/views/legal/page'
import SEO from '@/views/seo/page'
import Domains from '@/views/domains/page'
import Agents from '@/views/agents/page'
import Settings from '@/views/settings/page'
import Profil from '@/views/profil/page'

const pageTitles: Record<string, [string, string]> = {
  dashboard: ["Vue d'ensemble", "Activité de votre agence en temps réel"],
  contacts: ['Prospects & clients', 'Gérez et validez vos contacts'],
  clients: ['Clients', "Parcours d'accompagnement en 7 niveaux"],
  dossiers: ['Dossiers', 'Tous les dossiers'],
  taux: ['Taux & barèmes', 'Pilotez les taux affichés sur le simulateur'],
  emails: ["Modèles d'emails", 'Les emails utilisés par vos agents'],
  documents: ['Documents modèles', 'Modèles PDF à champs remplissables'],
  campaigns: ['Campagnes', 'Créez et envoyez des campagnes en masse'],
  history: ['Historique emails', 'Tous les emails envoyés à vos prospects'],
  cms: ['Contenu du site (CMS)', 'Modifiez le site public depuis le CRM'],
  testimonials: ['Avis & témoignages', 'Témoignages clients affichés sur la landing'],
  content: ['Sections du site', 'Éditez « Nos engagements » et « Nos services »'],
  legal: ['Pages légales', 'Mentions légales, Impressum, Datenschutz, CGV'],
  seo: ['SEO', 'Audit et référencement du site'],
  domains: ['Domaines', 'Gérez vos domaines et sous-domaines'],
  agents: ['Agents IA', 'Créez et configurez vos agents'],
  settings: ['Configuration', "Modèle d'IA, passerelles, cadence et sécurité"],
  profil: ['Mon profil', 'Informations personnelles et paramètres de compte'],
}

// =============================================================================
// AdminPage — racine du CRM.
// =============================================================================
// Auth via useSession() (next-auth/react) — pattern idiomatique NextAuth v5.
//   - loading        → spinner minimal (session en cours de résolution)
//   - unauthenticated → redirect vers /login (route NextAuth pages.signIn)
//   - authenticated  → rendu du CRM (Sidebar + Topbar + vue courante)
//
// Logout via signOut() — nettoie la session côté serveur + client.

export default function AdminPage() {
  const { status } = useSession()
  const router = useRouter()
  const [viewId, setViewId] = useState<string>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [brand, setBrand] = useState<{ siteName: string; logoUrl: string; logoAlt: string }>({ siteName: 'Kredix', logoUrl: '', logoAlt: 'Kredix' })

  const [title, subtitle] = pageTitles[viewId] || ['', '']

  // Fetch identité de marque (site_name, logo) au montage.
  useEffect(() => {
    fetch('/api/brand')
      .then((r) => r.json())
      .then((data) => setBrand(data))
      .catch(() => {})
  }, [])

  // Redirect vers /login si non authentifié.
  // useEffect évite un redirect pendant le SSR/initial render.
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  // Ferme le drawer mobile quand on change de vue.
  const handleViewChange = (id: string) => {
    setViewId(id)
    setSidebarOpen(false)
  }

  if (status !== 'authenticated') {
    // Loading ou unauthenticated (en attente du redirect) → spinner.
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid #e5e7eb',
            borderTopColor: '#2B8BDE',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            margin: '0 auto 12px',
          }} />
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            {status === 'loading' ? 'Chargement…' : 'Redirection vers la connexion…'}
          </p>
        </div>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const renderView = () => {
    switch (viewId) {
      case 'dashboard': return <Dashboard />
      case 'contacts': return <Contacts />
      case 'clients': return <Clients />
      case 'dossiers': return <Dossiers />
      case 'taux': return <Taux />
      case 'emails': return <Emails />
      case 'documents': return <Documents />
      case 'campaigns': return <Campaigns />
      case 'history': return <EmailHistory />
      case 'cms': return <CMS />
      case 'testimonials': return <Testimonials />
      case 'content': return <Content />
      case 'legal': return <Legal />
      case 'seo': return <SEO />
      case 'domains': return <Domains />
      case 'agents': return <Agents />
      case 'settings': return <Settings />
      case 'profil': return <Profil />
      default: return <Dashboard />
    }
  }

  return (
    <>
      {/* Overlay mobile — ferme le drawer au clic */}
      {sidebarOpen && (
        <div className="sb-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        currentView={viewId}
        onViewChange={handleViewChange}
        open={sidebarOpen}
        brandName={brand.siteName}
        logoUrl={brand.logoUrl}
        logoAlt={brand.logoAlt}
      />
      <div className="main">
        <Topbar
          title={title}
          subtitle={subtitle}
          onProfileClick={() => setViewId('profil')}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          onLogout={async () => {
            // signOut() de next-auth/react — nettoie cookie + state.
            // callbackUrl: '/' recharge / qui redirigera vers /login
            // (puisque la session est détruite).
            await signOut({ redirect: false })
            router.replace('/login')
          }}
        />
        <main className="view-content">{renderView()}</main>
      </div>
    </>
  )
}
