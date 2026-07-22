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

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) {
    redirect('/')
  }
  return <Login />
}
