// =============================================================================
// notifications.ts — Helper central de création de notifications.
// =============================================================================
// Utilisé par TOUS les points d'événements métier (apps/web + apps/admin) :
//   - Nouveau lead soumis
//   - Lead converti en client
//   - Bounce / complaint (webhook fournisseur)
//   - Échec d'envoi email (cron relance)
//   - Séquence terminée (timeout / max relances)
//   - Activité agent IA
//
// Le helper vérifie les préférences notif_* (table Setting) avant d'insérer :
// si la catégorie correspondante est désactivée, la notif n'est PAS créée.
//
// Toutes les notifs sont en broadcast (recipientId = null) → visibles par tous
// les admins du back-office.
// =============================================================================

import { prisma } from '../prisma/client'

// Mapping type de notification → clé de préférence Setting
const NOTIF_PREF_MAP: Record<string, string | null> = {
  new_prospect: 'notif_new_prospect',
  urgent_file: 'notif_urgent_file',
  agent_activity: 'notif_agent_activity',
  seo_audit: 'notif_seo_audit',
  // Les suivantes n'ont pas de toggle dédié → toujours créées
  client_converted: null,
  bounce: null,
  email_failed: null,
  sequence_timeout: null,
  sequence_max_relances: null,
}

export interface CreateNotificationInput {
  type: string
  title: string
  message: string
  icon?: string
  severity?: 'info' | 'success' | 'warning' | 'danger'
  linkUrl?: string
  relatedEntityId?: string
  recipientId?: string | null
}

/**
 * Crée une notification SI la préférence correspondante est activée.
 * En cas d'erreur DB, n'échoue jamais silencieusement (catch + console.error)
 * pour ne pas casser le flux métier appelant.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    // Vérifie la préférence notif_* (si applicable)
    const prefKey = NOTIF_PREF_MAP[input.type]
    if (prefKey) {
      const pref = await prisma.setting.findUnique({ where: { key: prefKey } })
      // Défaut : true si pas de setting (opt-out)
      if (pref && pref.value === 'false') return
    }

    await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        message: input.message,
        icon: input.icon ?? 'info',
        severity: input.severity ?? 'info',
        linkUrl: input.linkUrl ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        recipientId: input.recipientId ?? null,
      },
    })
  } catch (err) {
    // Ne jamais faire planter le flux métier à cause d'une notif
    console.error('[createNotification] Error:', err)
  }
}
