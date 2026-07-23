// =============================================================================
// /login — Page de connexion (route Next.js pour NextAuth pages.signIn).
// =============================================================================
// NextAuth v5 redirige vers cette route quand un utilisateur non authentifié
// tente d'accéder à une route protégée. Le composant <Login /> gère le flow
// via signIn('credentials', ...) et redirige vers / en cas de succès.
//
// Server component shell : si l'utilisateur est déjà authentifié, on redirige
// vers / immédiatement (pas de re-login inutile).

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Login } from '@/components/Login'
import { prisma } from '@kredix/db'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) {
    redirect('/')
  }

  // Identité de marque dynamique (nom + logo) depuis Settings.
  let brand = { siteName: 'Kredix', logoUrl: '', logoAlt: 'Kredix' }
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['site_name', 'cms_logo_url', 'cms_logo_alt'] } },
      select: { key: true, value: true },
    })
    const map = new Map(rows.map((r) => [r.key, r.value]))
    brand = {
      siteName: map.get('site_name') || 'Kredix',
      logoUrl: map.get('cms_logo_url') || '',
      logoAlt: map.get('cms_logo_alt') || map.get('site_name') || 'Kredix',
    }
  } catch {
    // DB indispo → fallback statique
  }

  return <Login brandName={brand.siteName} logoUrl={brand.logoUrl} logoAlt={brand.logoAlt} />
}
