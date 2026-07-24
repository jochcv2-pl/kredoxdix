// =============================================================================
// GET /api/leads/export — Export des leads au format CSV.
// =============================================================================
// Query params :
//   type   : all (défaut) | leads (non clients) | clients (status=client uniquement)
//
// Génère un fichier CSV téléchargeable (Excel-compatible, séparateur ;, BOM UTF-8).
// =============================================================================

import { NextRequest } from 'next/server'
import { prisma } from '@kredix/db'
import { errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Échapper les guillemets et entourer si nécessaire
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  progress: 'En cours',
  offer: 'Offre envoyée',
  waiting: 'En attente',
  client: 'Client',
  lost: 'Perdu',
}

const LOAN_TYPE_LABELS: Record<string, string> = {
  immo: 'Immobilier',
  conso: 'Consommation',
  rachat: 'Rachat de crédits',
  pro: 'Professionnel',
  autre: 'Autre',
}

export async function GET(req: NextRequest) {
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') ?? 'all'

    const where: Record<string, unknown> = {}
    if (type === 'leads') {
      where.status = { not: 'client' }
    } else if (type === 'clients') {
      where.status = 'client'
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000, // Limite de sécurité
    })

    // En-têtes CSV (séparateur ; pour Excel français)
    const headers = [
      'Nom',
      'Prénom',
      'Email',
      'Téléphone',
      'Ville',
      'Pays',
      'Type de crédit',
      'Montant demandé',
      'Durée (années)',
      'Mensualité estimée',
      'Taux annuel (%)',
      'Coût total',
      'Situation professionnelle',
      'Statut',
      'Langue préférée',
      'Date de création',
    ]

    const rows = leads.map((l) => [
      csvEscape(l.lastName),
      csvEscape(l.firstName),
      csvEscape(l.email),
      csvEscape(l.phone),
      csvEscape(l.city),
      csvEscape(l.country),
      csvEscape(LOAN_TYPE_LABELS[l.loanType] ?? l.loanType),
      csvEscape(l.amount),
      csvEscape(l.durationYears),
      csvEscape(l.monthlyPayment),
      csvEscape(l.annualRate),
      csvEscape(l.totalCost),
      csvEscape(l.employmentStatus),
      csvEscape(STATUS_LABELS[l.status] ?? l.status),
      csvEscape(l.preferredLanguage),
      csvEscape(l.createdAt.toISOString().split('T')[0]),
    ].join(';'))

    // BOM UTF-8 pour qu'Excel reconnaisse les accents
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')

    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `kredix-export-${type}-${dateStr}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[GET /api/leads/export] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
