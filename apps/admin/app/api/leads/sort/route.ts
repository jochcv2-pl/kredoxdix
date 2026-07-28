// =============================================================================
// POST /api/leads/sort — Tri intelligent des prospects par score de priorité.
// =============================================================================
// Body : { instructions?: string }
//
// Flow :
//   1. Scoring déterministe de base (règles métier pondérées)
//   2. Si des instructions sont fournies ET que l'IA est disponible,
//      le LLM re-classe les top leads selon les critères exprimés en langage naturel.
//   3. Fallback : scoring déterministe seul si l'IA échoue ou n'est pas configurée.
// =============================================================================

import { NextRequest } from 'next/server'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'
import { getLLMClient } from '@kredix/ai'

const LOAN_TYPE_SCORE: Record<string, number> = {
  immo: 100,
  conso: 60,
  rachat: 50,
  pro: 70,
  autre: 30,
}

const EMPLOYMENT_SCORE: Record<string, number> = {
  cdi: 100,
  'civil-servant': 95,
  fonctionnaire: 95,
  cdd: 60,
  independent: 60,
  'auto-entrepreneur': 50,
  freelance: 50,
  retired: 60,
  unemployed: 10,
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

function deterministicScore(
  leads: Array<{
    id: string; firstName: string; lastName: string; email: string | null;
    phone: string; city: string; loanType: string; amount: number;
    status: string; employmentStatus: string; monthlyPayment: number | null;
    createdAt: Date; annualRate: number | null; durationYears: number;
  }>,
): ScoredLead[] {
  const now = Date.now()
  const maxAmount = Math.max(...leads.map((l) => l.amount), 1)

  return leads.map((lead) => {
    const reasons: string[] = []

    const amountScore = (lead.amount / maxAmount) * 100
    if (lead.amount > 150000) reasons.push('Montant élevé')

    const ageDays = (now - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.max(0, (1 - ageDays / 30) * 100)
    if (ageDays < 1) reasons.push('Très récent')

    const emailScore = lead.email ? 100 : 0
    if (!lead.email) reasons.push('Sans email')

    const loanTypeScore = LOAN_TYPE_SCORE[lead.loanType.toLowerCase()] ?? 40
    const empScore = EMPLOYMENT_SCORE[lead.employmentStatus.toLowerCase()] ?? 50
    if (/cdi|civil|fonctionnaire/.test(lead.employmentStatus.toLowerCase())) reasons.push('Situation stable')

    const completenessScore = lead.monthlyPayment ? 100 : 50

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
}

/**
 * Appelle le LLM pour re-classer les leads selon les instructions de l'admin.
 * Retourne un Map<leadId, { score, reason }> ou null si l'IA échoue.
 */
async function aiRerank(
  leads: ScoredLead[],
  instructions: string,
): Promise<Map<string, { score: number; reason: string }> | null> {
  try {
    const { client, config } = await getLLMClient()

    // On envoie les top 40 leads au LLM (évite le timeout sur de gros volumes).
    const top = leads.slice(0, 40)

    const leadSummaries = top.map((l, i) =>
      `${i + 1}. ID:${l.id} | ${l.firstName} ${l.lastName} | ${l.loanType} | ${l.amount}€ | ${l.email ? 'email:oui' : 'email:non'} | ${l.city} | score_base:${l.score}`,
    ).join('\n')

    const systemPrompt = `Tu es un assistant de tri de prospects pour un courtier en crédit. L'administrateur te donne des instructions en langage naturel et une liste de prospects avec leurs données. Tu dois reclasser chaque prospect en attribuant un score de 0 à 100 et une courte raison, en respectant SCRUPULEUSEMENT les critères de l'administrateur.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown :
{
  "scores": [
    { "id": "ID du prospect", "score": 0-100, "reason": "courte raison (max 10 mots)" }
  ]
}`

    const userPrompt = `INSTRUCTIONS DE L'ADMINISTRATEUR :
${instructions}

PROSPECTS À NOTER :
${leadSummaries}

Attribue un score 0-100 à chaque prospect en suivant les instructions ci-dessus. Sois strict : si l'admin dit d'écarter un profil, donne-lui un score bas. Si l'admin dit de prioriser un critère, donne un score haut à ceux qui le remplissent.`

    const completion = await client.chat.completions.create(
      {
        model: config.model,
        temperature: 0.3,
        max_tokens: Math.min(2000, config.maxTokens),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { timeout: 30_000 },
    )

    const raw = completion.choices[0]?.message?.content?.trim() || ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.scores || !Array.isArray(parsed.scores)) return null

    const result = new Map<string, { score: number; reason: string }>()
    for (const item of parsed.scores) {
      if (item.id && typeof item.score === 'number') {
        result.set(item.id, {
          score: Math.max(0, Math.min(100, Math.round(item.score))),
          reason: item.reason || 'Score IA',
        })
      }
    }

    return result.size > 0 ? result : null
  } catch (err) {
    console.error('[POST /api/leads/sort] AI rerank failed:', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const body = await req.json().catch(() => ({}))
    const instructions = (body?.instructions as string)?.trim() ?? ''

    // Récupère tous les leads non terminaux
    const leads = await prisma.lead.findMany({
      where: {
        status: { notIn: ['client', 'lost'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // 1. Scoring déterministe de base
    let scored = deterministicScore(leads)
    scored.sort((a, b) => b.score - a.score)

    let aiUsed = false

    // 2. Si instructions fournies, tenter le re-classement par IA
    if (instructions && scored.length > 0) {
      const aiScores = await aiRerank(scored, instructions)
      if (aiScores) {
        aiUsed = true
        scored = scored.map((sl) => {
          const ai = aiScores.get(sl.id)
          if (ai) {
            return {
              ...sl,
              score: ai.score,
              scoreReason: `IA: ${ai.reason}`,
            }
          }
          return sl
        })
        scored.sort((a, b) => b.score - a.score)
      }
    }

    return successResponse({
      leads: scored,
      aiUsed,
      total: scored.length,
    })
  } catch (err) {
    console.error('[POST /api/leads/sort] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
