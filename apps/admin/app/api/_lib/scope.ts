// =============================================================================
// scope.ts — Helpers d'isolation des données par admin (DEC-K5 multi-admin)
// =============================================================================
// Centralise les filtres Prisma WHERE à appliquer selon le rôle de l'admin
// connecté. À utiliser sur TOUTES les routes qui lisent des données métier
// (Lead, Campaign, EmailGateway, EmailLog, ClientStep, CampaignRecipient).
//
// Règle d'isolation :
//   - super-admin (role='admin') → voit TOUT (filtre vide {})
//   - conseiller (role='advisor') → ne voit que SES données
//
// Usage type :
//   const [admin, deny] = await requireAuth()
//   if (deny) return deny
//   const scope = getLeadScope(admin)
//   const leads = await prisma.lead.findMany({ where: { ...scope, ...otherFilters } })
//
// ATTENTION : pour les mutations (update/delete), toujours inclure le scope
// dans le WHERE — sinon un conseiller pourrait muter la donnée d'un autre
// via son ID (vulnérabilité IDOR). Exemple :
//   await prisma.lead.update({
//     where: { id, ...getLeadScope(admin) },  // ✅ IDOR-safe
//     data: { ... }
//   })
// Note : Prisma exige que `where` ne contienne qu'un seul `id` — utiliser
// `updateMany` ou `findUnique + check` pour les mutations avec scope.
// =============================================================================

import { Prisma } from '@prisma/client'
import type { AdminUser } from '@prisma/client'

/**
 * true si l'admin connecté est super-admin (voit toutes les données).
 * Utilisé pour conditionner l'UI (affichage onglet "Tous", boutons transfert, etc.).
 */
export function isSuperAdmin(admin: Pick<AdminUser, 'role'>): boolean {
  return admin.role === 'admin'
}

/**
 * Scope pour Lead : filtre par assignedToId (le conseiller ne voit que ses leads assignés).
 * Le super-admin voit tous les leads.
 */
export function getLeadScope(admin: Pick<AdminUser, 'id' | 'role'>): Prisma.LeadWhereInput {
  return isSuperAdmin(admin) ? {} : { assignedToId: admin.id }
}

/**
 * Scope pour Campaign : filtre par ownerId (le conseiller ne voit que ses campagnes).
 * Le super-admin voit toutes les campagnes (y compris legacy ownerId IS NULL).
 */
export function getCampaignScope(admin: Pick<AdminUser, 'id' | 'role'>): Prisma.CampaignWhereInput {
  return isSuperAdmin(admin) ? {} : { ownerId: admin.id }
}

/**
 * Scope pour EmailGateway : filtre par ownerId.
 * Le super-admin voit aussi les SMTP système (isSystem = true, ownerId null).
 * Le conseiller ne voit que SES SMTP (il ne peut pas utiliser le SMTP système directement).
 */
export function getGatewayScope(admin: Pick<AdminUser, 'id' | 'role'>): Prisma.EmailGatewayWhereInput {
  return isSuperAdmin(admin) ? {} : { ownerId: admin.id }
}

/**
 * Scope pour EmailLog : filtre par lead.assignedToId (les emails des leads du conseiller).
 * Le super-admin voit tous les logs.
 * Note : les logs sans lead (campagne sans lead rattaché) ne sont visibles que du
 * super-admin OU via getCampaignLogScope (logs des campagnes du conseiller).
 */
export function getEmailLogScope(admin: Pick<AdminUser, 'id' | 'role'>): Prisma.EmailLogWhereInput {
  return isSuperAdmin(admin) ? {} : { lead: { assignedToId: admin.id } }
}

/**
 * Scope pour ClientStep : filtre par lead.assignedToId (le parcours client des leads du conseiller).
 * Le super-admin voit tous les parcours clients.
 */
export function getClientStepScope(admin: Pick<AdminUser, 'id' | 'role'>): Prisma.ClientStepWhereInput {
  return isSuperAdmin(admin) ? {} : { lead: { assignedToId: admin.id } }
}

/**
 * Scope pour CampaignRecipient : filtre par campaign.ownerId.
 * Le super-admin voit tous les destinataires.
 */
export function getCampaignRecipientScope(admin: Pick<AdminUser, 'id' | 'role'>): Prisma.CampaignRecipientWhereInput {
  return isSuperAdmin(admin) ? {} : { campaign: { ownerId: admin.id } }
}
