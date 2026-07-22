'use client'

// =============================================================================
// AuthProvider — wrapper SessionProvider de next-auth/react.
// =============================================================================
// Doit être un client component (SessionProvider utilise useContext).
// Posé au plus haut niveau dans app/layout.tsx pour que useSession() soit
// utilisable partout côté client.

import { SessionProvider } from 'next-auth/react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
