// =============================================================================
// POST /api/leads/import — Import massif de prospects depuis un fichier CSV.
// =============================================================================
// L'admin importe un CSV de prospects (parsing + mapping côté client).
// Chaque ligne valide crée un Lead en statut "new" sans séquence active.
// Déduplication par email : si un email existe déjà en DB, le prospect est ignoré.
//
// Limites :
//   - Max 500 leads par import (anti-abus).
//   - Seuls les champs mappés sont remplis (les autres utilisent les defaults Prisma).
// =============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma, LeadStatus } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses'
import { requireAuth } from '../../_lib/auth-server'
import { getLeadScope } from '../../_lib/scope'

const MAX_IMPORT_COUNT = 500

// Schéma d'un prospect issu du CSV (après mapping côté client).
const importLeadSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).default(''),
  city: z.string().max(120).default('Inconnu'),
  country: z.string().max(10).default('FR'),
  loanType: z.string().max(60).default('autre'),
  amount: z.coerce.number().int().min(0).default(0),
  durationYears: z.coerce.number().int().min(0).max(40).default(0),
  employmentStatus: z.string().max(120).default('Non précisé'),
  preferredLanguage: z.string().max(10).default('fr'),
  companyName: z.string().optional().or(z.literal('')),
})

const importLeadsBodySchema = z.object({
  leads: z.array(importLeadSchema).min(1).max(MAX_IMPORT_COUNT),
})

export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAuth()
  if (deny) return deny

  const [data, error] = await parseBody(req, importLeadsBodySchema)
  if (error) return error

  try {
    // Déduplication interne (email insensible à la casse, dernier gagne).
    const deduped = new Map<string, typeof data.leads[number]>()
    for (const lead of data.leads) {
      const key = lead.email?.trim().toLowerCase() || `${lead.phone.trim().toLowerCase()}_${lead.firstName.trim().toLowerCase()}`
      deduped.set(key, lead)
    }
    const uniqueLeads = Array.from(deduped.values())

    // Vérifier les emails déjà existants en DB pour les exclure.
    const emailsToCheck = uniqueLeads
      .map((l) => l.email?.trim().toLowerCase())
      .filter((e): e is string => !!e && e.length > 0)

    const existingEmails = new Set<string>()
    if (emailsToCheck.length > 0) {
      // Prisma findMany avec mode insensitive (PostgreSQL).
      // Scope multi-admin (DEC-K5) : la déduplication est par conseiller (un même prospect
      // peut légitimement exister pour 2 conseillers différents).
      const existing = await prisma.lead.findMany({
        where: {
          ...getLeadScope(admin!),
          email: { in: emailsToCheck, mode: 'insensitive' },
        },
        select: { email: true },
      })
      for (const e of existing) {
        existingEmails.add(e.email!.toLowerCase())
      }
    }

    // Filtrer les leads dont l'email existe déjà.
    const newLeads = uniqueLeads.filter((l) => {
      if (!l.email?.trim()) return true // pas d'email = pas de conflit
      return !existingEmails.has(l.email.trim().toLowerCase())
    })

    if (newLeads.length === 0) {
      return successResponse({
        imported: 0,
        duplicates: uniqueLeads.length - newLeads.length,
        errors: 0,
        message: 'Tous les prospects existent déjà en base.',
      })
    }

    // Bulk create.
    const created = await prisma.lead.createMany({
      data: newLeads.map((l) => ({
        firstName: l.firstName.trim(),
        lastName: l.lastName.trim(),
        email: l.email?.trim() || null,
        phone: l.phone?.trim() || '0000000000',
        city: l.city.trim() || 'Inconnu',
        country: l.country || 'FR',
        loanType: l.loanType || 'autre',
        amount: l.amount || 0,
        durationYears: l.durationYears || 0,
        employmentStatus: l.employmentStatus || 'Non précisé',
        preferredLanguage: l.preferredLanguage || 'fr',
        companyName: l.companyName?.trim() || null,
        status: LeadStatus.new,
        sequenceActive: false,
        assignedToId: admin!.id,
      })),
      skipDuplicates: true, // protection supplémentaire (UNIQUE sur unsubscribeToken)
    })

    const duplicateCount = uniqueLeads.length - newLeads.length

    return successResponse({
      imported: created.count,
      duplicates: duplicateCount,
      errors: 0,
      total: data.leads.length,
      message: `${created.count} prospect(s) importé(s), ${duplicateCount} doublon(s) ignoré(s).`,
    })
  } catch (err) {
    console.error('[POST /api/leads/import] Erreur:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
