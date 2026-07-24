// =============================================================================
// POST /api/leads/sort — Tri intelligent des prospects par score de priorité.
// =============================================================================
// Body : { instructions?: string }
//
// Le scorement est déterministe (pas d'IA coûteuse) et basé sur des règles
// métier pondérées. Les instructions en langage naturel ajustent les poids
// (détection de mots-clés : montant, CDI, immobilier, email...).
//
// Facteurs de scoring (base) :
//   - Montant demandé        (plus élevé = plus intéressant)
//   - Récence                (plus récent = plus urgent)
//   - Email présent          (communicable)
//   - Type de prêt           (immo > conso > rachat > pro > autre)
//   - Situation professionnelle (CDI/salarié > indépendant > autre)
//   - Complétude du dossier  (mensualité calculée = simulateur utilisé)
//
// Instructions ajustables via le texte libre :
//   - "montant" / "150 000" → boost du poids montant
//   - "CDI" / "salarié" → boost situation pro
//   - "immobilier" / "immo" → boost type immobilier
//   - "email" → boost communicabilité
// =============================================================================

import { NextRequest } from 'next/server'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'

const LOAN_TYPE_SCORE: Record<string, number> = {
  immo: 100,
  conso: 60,
  rachat: 50,
  pro: 70,
  autre: 30,
}

const EMPLOYMENT_SCORE: Record<string, number> = {
  cdi: 100,
  salarié: 90,
  salarie: 90,
  'cdii': 70,
  indépendant: 60,
  independent: 60,
  'auto-entrepreneur': 50,
  freelance: 50,
  fonctionnaire: 95,
  retraité: 60,
  retraite: 60,
  étudiant: 30,
  etudiant: 30,
  sans: 10,
  chômage: 10,
  chomage: 10,
}

interface ScoredLead {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string
  city: string
  loanType: string
  amount: number
  status: string
  score: number
  scoreReason: string
  createdAt: string
}

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const body = await req.json().catch(() => ({}))
    const instructions = (body?.instructions as string)?.toLowerCase() ?? ''

    // Poids de base
    let weightAmount = 1
    let weightRecency = 1
    let weightEmail = 1
    let weightLoanType = 1
    let weightEmployment = 1
    let weightCompleteness = 1

    // Ajustement des poids selon les instructions (mot-clés)
    if (instructions) {
      if (/montant|somme|\d+\s*000|euro|€/.test(instructions)) weightAmount = 2
      if (/cdi|salarié|salaries|salari/.test(instructions)) weightEmployment = 2
      if (/immobilier|immo|prêt immo/.test(instructions)) weightLoanType = 2
      if (/email|mail|contact/.test(instructions)) weightEmail = 1.5
      if (/récent|nouveau|urgent|priorit/.test(instructions)) weightRecency = 2
      if (/complet|simulation|simulé/.test(instructions)) weightCompleteness = 1.5
    }

    // Récupère tous les leads non terminaux
    const leads = await prisma.lead.findMany({
      where: {
        status: { notIn: ['client', 'lost'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const now = Date.now()
    const maxAmount = Math.max(...leads.map((l) => l.amount), 1)

    const scored: ScoredLead[] = leads.map((lead) => {
      const reasons: string[] = []

      // Score montant (0-100)
      const amountScore = (lead.amount / maxAmount) * 100 * weightAmount
      if (lead.amount > 150000) reasons.push('Montant élevé')

      // Score récence (0-100) — décroissance sur 30 jours
      const ageDays = (now - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      const recencyScore = Math.max(0, (1 - ageDays / 30) * 100) * weightRecency
      if (ageDays < 1) reasons.push('Très récent')

      // Score email
      const emailScore = (lead.email ? 100 : 0) * weightEmail
      if (!lead.email) reasons.push('Sans email')

      // Score type de prêt
      const loanTypeScore = (LOAN_TYPE_SCORE[lead.loanType.toLowerCase()] ?? 40) * weightLoanType

      // Score situation pro
      const empKey = lead.employmentStatus.toLowerCase()
      const empScore = (EMPLOYMENT_SCORE[empKey] ?? 50) * weightEmployment
      if (/cdi|salari|fonctionnaire/.test(empKey)) reasons.push('Situation stable')

      // Score complétude
      const completenessScore = (lead.monthlyPayment ? 100 : 50) * weightCompleteness

      const totalScore = Math.round(
        amountScore * 0.25 +
        recencyScore * 0.2 +
        emailScore * 0.1 +
        loanTypeScore * 0.15 +
        empScore * 0.2 +
        completenessScore * 0.1,
      )

      return {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        loanType: lead.loanType,
        amount: lead.amount,
        status: lead.status,
        score: Math.min(100, totalScore),
        scoreReason: reasons.join(', ') || 'Score standard',
        createdAt: lead.createdAt.toISOString(),
      }
    })

    // Tri par score décroissant
    scored.sort((a, b) => b.score - a.score)

    return successResponse({
      leads: scored,
      weights: {
        amount: weightAmount,
        recency: weightRecency,
        email: weightEmail,
        loanType: weightLoanType,
        employment: weightEmployment,
        completeness: weightCompleteness,
      },
      total: scored.length,
    })
  } catch (err) {
    console.error('[POST /api/leads/sort] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
