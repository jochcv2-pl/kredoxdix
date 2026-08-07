// =============================================================================
// POST /api/leads/sort-csv — Tri/filtrage IA sur données CSV brutes (avant import).
// =============================================================================
// L'admin a parsé un CSV et mappé les colonnes. Il veut filtrer les lignes
// avec l'IA avant de les importer en base.
//
// Body : {
//   leads: Array<{ firstName, lastName, email?, phone?, city?, amount?, loanType?, ... }>
//   instructions: string  // critères en langage naturel
// }
//
// Retour : { leads: ScoredCsvLead[] } — lignes scorées, prêtes à sélection.
//
// Le scoring est 100% IA (deterministic seul si IA indisponible).
// Aucune donnée n'est écrite en base.
// =============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { successResponse, errorResponse, ERR, parseBody } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'
import { getLLMClient } from '@kredix/ai'

const LOAN_TYPE_SCORE: Record<string, number> = {
  immo: 100,
  conso: 60,
  rachat: 50,
  pro: 70,
  autre: 30,
}

interface CsvLeadInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  city?: string
  amount?: number | string
  loanType?: string
  employmentStatus?: string
  [key: string]: unknown // champs additionnels du CSV
}

interface ScoredCsvLead {
  index: number
  firstName: string
  lastName: string
  email: string
  phone: string
  city: string
  amount: number
  loanType: string
  score: number
  scoreReason: string
  retained: boolean // true = l'IA recommande de garder, false = à écarter
}

const sortCsvBodySchema = z.object({
  leads: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    city: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    loanType: z.string().optional(),
    employmentStatus: z.string().optional(),
  })).min(1).max(500),
  instructions: z.string().min(1),
})

/**
 * Scoring déterministe de fallback (si l'IA échoue).
 * Score sur 100 basé sur les données disponibles.
 */
function deterministicScoreCsv(leads: CsvLeadInput[]): ScoredCsvLead[] {
  const maxAmount = Math.max(...leads.map((l) => parseAmount(l.amount)), 1)

  return leads.map((lead, index) => {
    const reasons: string[] = []
    const amount = parseAmount(lead.amount)

    const amountScore = (amount / maxAmount) * 100
    if (amount > 150000) reasons.push('Montant élevé')

    const emailScore = lead.email?.trim() ? 100 : 0
    if (!lead.email?.trim()) reasons.push('Sans email')

    const loanType = lead.loanType?.toLowerCase() || 'autre'
    const loanTypeScore = LOAN_TYPE_SCORE[loanType] ?? 40

    const totalScore = Math.round(
      amountScore * 0.5 +
      emailScore * 0.2 +
      loanTypeScore * 0.3,
    )

    return {
      index,
      firstName: lead.firstName.trim(),
      lastName: lead.lastName.trim(),
      email: lead.email?.trim() || '',
      phone: lead.phone?.trim() || '',
      city: lead.city?.trim() || '',
      amount,
      loanType: lead.loanType || 'autre',
      score: Math.min(100, totalScore),
      scoreReason: reasons.join(', ') || 'Score standard',
      retained: totalScore >= 30, // par défaut on garde si score >= 30
    }
  })
}

function parseAmount(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    // "150 000" → 150000, "150000" → 150000, "150000€" → 150000
    const cleaned = val.replace(/[^\d.-]/g, '')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : Math.abs(n)
  }
  return 0
}

/**
 * Appelle le LLM pour scorer et filtrer les lignes CSV.
 * Retourne les leads avec score + décision retained/rejeté.
 */
async function aiScoreCsv(
  leads: CsvLeadInput[],
  instructions: string,
): Promise<ScoredCsvLead[] | null> {
  try {
    const { client, config } = await getLLMClient()

    // Limiter à 100 lignes pour éviter le timeout LLM
    const subset = leads.slice(0, 100)

    const leadSummaries = subset.map((l, i) => {
      const amount = parseAmount(l.amount)
      return `${i + 1}. ${l.firstName} ${l.lastName} | ${l.loanType || '?'} | ${amount}€ | ${l.email ? 'email:oui' : 'email:non'} | ${l.city || '?'} | ${l.employmentStatus || '?'}`
    }).join('\n')

    const systemPrompt = `Tu es un assistant de tri de prospects pour un courtier en crédit. L'administrateur te donne des instructions de filtrage en langage naturel et une liste de prospects extraits d'un fichier CSV (pas encore en base de données).

Tu dois évaluer chaque prospect selon les critères de l'administrateur et décider :
- Un score de 0 à 100 (100 = correspond parfaitement aux critères)
- Une courte raison expliquant ta décision
- "retained": true si le prospect correspond aux critères (à importer), false sinon

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown :
{
  "scores": [
    { "index": 0, "score": 85, "reason": "Montant 250k€ immo, CDI", "retained": true },
    { "index": 1, "score": 15, "reason": "Montant trop bas", "retained": false }
  ]
}

IMPORTANT : "index" correspond au numéro de la ligne dans la liste (commence à 0).
Si l'administrateur demande d'écarter certains profils, mets retained: false et un score bas.`

    const userPrompt = `INSTRUCTIONS DE L'ADMINISTRATEUR :
${instructions}

PROSPECTS À ÉVALUER (${subset.length} lignes) :
${leadSummaries}

Pour chaque prospect, détermine s'il correspond aux critères de l'administrateur.`

    const completion = await client.chat.completions.create(
      {
        model: config.model,
        temperature: 0.2, // bas pour être déterministe sur les filtres
        max_tokens: Math.min(4000, config.maxTokens),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { timeout: 45_000 },
    )

    const raw = completion.choices[0]?.message?.content?.trim() || ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.scores || !Array.isArray(parsed.scores)) return null

    // Mapper les scores IA sur les leads
    const results: ScoredCsvLead[] = subset.map((lead, index) => {
      const ai = parsed.scores.find((s: { index: number }) => s.index === index)
      if (ai && typeof ai.score === 'number') {
        return {
          index,
          firstName: lead.firstName.trim(),
          lastName: lead.lastName.trim(),
          email: lead.email?.trim() || '',
          phone: lead.phone?.trim() || '',
          city: lead.city?.trim() || '',
          amount: parseAmount(lead.amount),
          loanType: lead.loanType || 'autre',
          score: Math.max(0, Math.min(100, Math.round(ai.score))),
          scoreReason: ai.reason || 'Évalué par IA',
          retained: ai.retained !== false, // true par défaut
        }
      }
      // Lead non scoré par l'IA → fallback
      return {
        index,
        firstName: lead.firstName.trim(),
        lastName: lead.lastName.trim(),
        email: lead.email?.trim() || '',
        phone: lead.phone?.trim() || '',
        city: lead.city?.trim() || '',
        amount: parseAmount(lead.amount),
        loanType: lead.loanType || 'autre',
        score: 0,
        scoreReason: 'Non évalué par IA',
        retained: true,
      }
    })

    return results
  } catch (err) {
    console.error('[POST /api/leads/sort-csv] AI score failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth()
  if (deny) return deny

  const [data, error] = await parseBody(req, sortCsvBodySchema)
  if (error) return error

  try {
    // 1. Tenter le scoring IA
    let results: ScoredCsvLead[] | null = await aiScoreCsv(data.leads, data.instructions)
    let aiUsed = false

    if (results) {
      aiUsed = true
      // Trier par score descendant
      results.sort((a, b) => b.score - a.score)
    } else {
      // 2. Fallback : scoring déterministe
      results = deterministicScoreCsv(data.leads)
      results.sort((a, b) => b.score - a.score)
    }

    return successResponse({
      leads: results,
      aiUsed,
      total: results.length,
      retained: results.filter((r) => r.retained).length,
      rejected: results.filter((r) => !r.retained).length,
    })
  } catch (err) {
    console.error('[POST /api/leads/sort-csv] Error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
