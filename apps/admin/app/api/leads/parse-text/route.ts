// =============================================================================
// POST /api/leads/parse-text — Extraction de prospect depuis texte collé.
// =============================================================================
// L'admin colle une notification de formulaire (WordPress, Elementor, etc.)
// et l'API extrait les champs structurés pour pré-remplir la création d'un lead.
//
// Stratégie :
//   1. Regex (rapide, fiable) pour les formats semi-structurés courants
//   2. Fallback IA (LLM) si le regex n'extrait pas assez de champs
//
// Body : { text: string }
// Retour : { data: ParsedLeadResult }
//
// Aucune donnée n'est écrite en base — extraction seule, validation par l'admin.
// =============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { successResponse, errorResponse, parseBody } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'
import { getLLMClient } from '@kredix/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedLead {
  firstName: string
  lastName: string
  email: string
  phone: string
  amount: number | null
  submittedAt: string | null  // ISO string
  confidence: 'high' | 'medium' | 'low'
  method: 'regex' | 'ai'
}

const REQUIRED_FOR_HIGH = ['firstName', 'lastName', 'email']

// ---------------------------------------------------------------------------
// Regex extraction
// ---------------------------------------------------------------------------

/** Patterns de date multi-langues dans un header de notification.
 *  Note : [\w\u00C0-\u024F] au lieu de \w seul car \w ne matche pas
 *  les lettres accentuées (é, û, ü, ä, etc.) en JS regex. */
const DATE_PATTERNS: RegExp[] = [
  // FR: "Envoyé le Samedi 1 août 2026 16:36"
  /Envoy[ée]\s+le\s+(?:Lundi|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)?\s*(\d{1,2})\s+([\w\u00C0-\u024F]+)\s+(\d{4})\s+(\d{1,2}:\d{2})/i,
  // EN: "Submitted on Saturday, August 1, 2026 4:36 PM"
  /Submitted\s+on\s+[\w\u00C0-\u024F]+,\s+([\w\u00C0-\u024F]+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i,
  // DE: "Gesendet am Samstag, 1. August 2026, 16:36"
  /Gesendet\s+am\s+[\w\u00C0-\u024F]+,\s+(\d{1,2})\.\s+([\w\u00C0-\u024F]+)\s+(\d{4}),?\s+(\d{1,2}:\d{2})/i,
  // ES: "Enviado el Sábado 1 agosto 2026 16:36"
  /Enviado\s+el\s+[\w\u00C0-\u024F]+\s+(\d{1,2})\s+de\s+([\w\u00C0-\u024F]+)\s+de\s+(\d{4})\s+(\d{1,2}:\d{2})/i,
  // IT: "Inviato il Sabato 1 agosto 2026 16:36"
  /Inviato\s+il\s+[\w\u00C0-\u024F]+\s+(\d{1,2})\s+([\w\u00C0-\u024F]+)\s+(\d{4})\s+(\d{1,2}:\d{2})/i,
  // PT: "Enviado Sábado 1 agosto 2026 16:36"
  /Enviado\s+[\w\u00C0-\u024F]+\s+(\d{1,2})\s+(?:de\s+)?([\w\u00C0-\u024F]+)\s+(?:de\s+)?(\d{4})\s+(\d{1,2}:\d{2})/i,
  // Generic: "2026-08-01 16:36" or "01/08/2026 16:36" or "01.08.2026 16:36"
  /(\d{4}[-/]\d{2}[-/]\d{2})\s+(\d{1,2}:\d{2})/,
  /(\d{1,2}[-/]\d{2}[-/]\d{4})\s+(\d{1,2}:\d{2})/,
]

const MONTH_MAP_FR: Record<string, number> = {
  'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
  'juillet': 7, 'août': 8, 'aout': 8, 'septembre': 9, 'octobre': 10,
  'novembre': 11, 'décembre': 12,
}

const MONTH_MAP_EN: Record<string, number> = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10,
  'november': 11, 'december': 12,
}

const MONTH_MAP_DE: Record<string, number> = {
  'januar': 1, 'februar': 2, 'märz': 3, 'april': 4, 'mai': 5, 'juni': 6,
  'juli': 7, 'august': 8, 'september': 9, 'oktober': 10,
  'november': 11, 'dezember': 12,
}

const MONTH_MAP_ES: Record<string, number> = {
  'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
  'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10,
  'noviembre': 11, 'diciembre': 12,
}

const MONTH_MAP_IT: Record<string, number> = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10,
  'novembre': 11, 'dicembre': 12,
}

const MONTH_MAP_PT: Record<string, number> = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4, 'maio': 5, 'junho': 6,
  'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10,
  'novembro': 11, 'dezembro': 12,
}

/** Résout un nom de mois vers un numéro (1-12), multi-langue. */
function resolveMonth(monthName: string): number | undefined {
  const lower = monthName.toLowerCase().replace(/[.,]/g, '')
  const allMaps = [MONTH_MAP_FR, MONTH_MAP_EN, MONTH_MAP_DE, MONTH_MAP_ES, MONTH_MAP_IT, MONTH_MAP_PT]
  for (const map of allMaps) {
    if (map[lower] !== undefined) return map[lower]
  }
  return undefined
}

/** Parse une date depuis les patterns de notification. */
function extractDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue

    let year: number | undefined
    let month: number | undefined
    let day: number | undefined
    let time = '12:00'

    if (pattern.source.includes('\\d{4}[-/]')) {
      // Format YYYY-MM-DD or DD/MM/YYYY
      const [datePart, timePart] = [match[1], match[2]]
      time = timePart || '12:00'

      if (datePart.startsWith(/^\d{4}/.test(datePart) ? '' : 'x')) {
        // DD/MM/YYYY
        const parts = datePart.split(/[-/]/)
        if (parts.length === 3) {
          day = parseInt(parts[0], 10)
          month = parseInt(parts[1], 10)
          year = parseInt(parts[2], 10)
        }
      } else {
        // YYYY-MM-DD
        const parts = datePart.split(/[-/]/)
        if (parts.length === 3) {
          year = parseInt(parts[0], 10)
          month = parseInt(parts[1], 10)
          day = parseInt(parts[2], 10)
        }
      }
    } else {
      // Format textuel : jour mois année heure
      if (pattern.source.includes('Gesendet')) {
        // DE : day. month year time
        day = parseInt(match[1], 10)
        month = resolveMonth(match[2])
        year = parseInt(match[3], 10)
        time = match[4] || '12:00'
      } else if (pattern.source.includes('Submitted')) {
        // EN : month day, year time
        month = resolveMonth(match[1])
        day = parseInt(match[2], 10)
        year = parseInt(match[3], 10)
        time = match[4] || '12:00'
      } else {
        // FR/ES/IT/PT : day month year time
        day = parseInt(match[1], 10)
        month = resolveMonth(match[2])
        year = parseInt(match[3], 10)
        time = match[4] || '12:00'
      }
    }

    if (year && month && day && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Normaliser le time
      const timeParts = time.replace(/\s*(?:AM|PM)/i, '').split(':')
      let hours = parseInt(timeParts[0], 10) || 12
      const minutes = parseInt(timeParts[1], 10) || 0
      if (/PM/i.test(time) && hours < 12) hours += 12
      if (/AM/i.test(time) && hours === 12) hours = 0

      try {
        const iso = new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString()
        return iso
      } catch {
        // Date invalide (ex: 31 février)
      }
    }
  }
  return null
}

/** Patterns de labels de champs multi-langues. */
const LABEL_PATTERNS: Record<string, RegExp[]> = {
  email: [
    /\be-?mail\b/i,
    /\bemail\s+address\b/i,
    /\bcourriel\b/i,
    /\be-mailadresse\b/i,
    /\bcorreo\s+electr[oó]nico\b/i,
  ],
  phone: [
    /\bphone\s*(?:number)?\b/i,
    /\bt[eéè]l[eéè]?phone\b/i,
    /\bt[eéè]l[eéè]?(?:\.\s*)?(?:number|nummer|num[ée]ro)?\b/i,
    /\bmobil(?:e|funk)?\b/i,
    /\bnum[eé]ro\s+de\s+t[eéè]l[eéè]phone\b/i,
    /\btelefono\b/i,
    /\btelefon\b/i,
    /\bt[eéè]l\b/i,
  ],
  fullName: [
    /\bfull\s*name\b/i,
    /\bfull\s*name\s*\(/i,
    /\bnom\s+complet\b/i,
    /\bvollst[aä]ndiger\s+name\b/i,
    /\bnome\s+completo\b/i,
    /\bnombre\s+completo\b/i,
  ],
  firstName: [
    /\bfirst\s*name\b/i,
    /\bpr[eéè]nom\b/i,
    /\bvorname\b/i,
    /\bnombre\b/i,
    /\bnome\b/i,
  ],
  lastName: [
    /\blast\s*name\b/i,
    /\bnom\s*de\s*famille\b/i,
    /\bnom\b/i,
    /\bnachname\b/i,
    /\bapellido(?:s)?\b/i,
    /\bcognome\b/i,
  ],
  amount: [
    /\b(?:wie\s+viel\s+brauchen\s+sie|how\s+much|combien|cu[aá]nto)\b/i,
    /\bmontant\b/i,
    /\bbetrag\b/i,
    /\bamount\b/i,
    /\bkreditbetrag\b/i,
    /\bimporte\b/i,
    /\bvalor\b/i,
    /\bdarlehensbetrag\b/i,
  ],
}

/** Extrait un champ label→valeur : le label est sur une ligne, la valeur sur la suivante. */
function extractFieldValue(text: string, patterns: RegExp[]): string | null {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length - 1; i++) {
    const labelLine = lines[i].trim()
    const valueLine = lines[i + 1].trim()
    if (!labelLine || !valueLine) continue

    for (const pattern of patterns) {
      // Le label peut être seul sur la ligne, ou suivi de parenthèses/points
      if (pattern.test(labelLine) && !labelLine.includes('@') && !/^\d/.test(labelLine)) {
        return valueLine
      }
    }
  }
  return null
}

/** Sépare un nom complet en firstName + lastName. */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return { firstName: fullName.trim(), lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] }
  // Plus de 2 parties : le premier = prénom, le reste = nom
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** Extraction regex complète. */
function extractWithRegex(text: string): ParsedLead | null {
  // Extraire la date de soumission
  const submittedAt = extractDate(text)

  // Extraire le nom complet
  const fullNameRaw = extractFieldValue(text, LABEL_PATTERNS.fullName)
  let firstName = ''
  let lastName = ''

  if (fullNameRaw) {
    const split = splitFullName(fullNameRaw)
    firstName = split.firstName
    lastName = split.lastName
  } else {
    // Essayer firstName + lastName séparés
    const rawFirst = extractFieldValue(text, LABEL_PATTERNS.firstName)
    const rawLast = extractFieldValue(text, LABEL_PATTERNS.lastName)
    if (rawFirst) firstName = rawFirst
    if (rawLast) lastName = rawLast
  }

  // Email
  const email = extractFieldValue(text, LABEL_PATTERNS.email) || extractEmailInline(text)

  // Phone
  const phone = extractFieldValue(text, LABEL_PATTERNS.phone)

  // Amount
  const amountRaw = extractFieldValue(text, LABEL_PATTERNS.amount)
  let amount: number | null = null
  if (amountRaw) {
    const num = parseInt(amountRaw.replace(/[^\d]/g, ''), 10)
    if (num > 0) amount = num
  }

  // Vérifier qu'on a au minimum un nom (firstName ou lastName)
  if (!firstName && !lastName) return null

  // Déterminer la confiance
  const detected: string[] = []
  if (firstName) detected.push('firstName')
  if (lastName) detected.push('lastName')
  if (email) detected.push('email')
  if (phone) detected.push('phone')
  if (amount !== null) detected.push('amount')
  if (submittedAt) detected.push('submittedAt')

  const hasAllRequired = REQUIRED_FOR_HIGH.every((f) => detected.includes(f))
  const confidence: ParsedLead['confidence'] = hasAllRequired ? 'high' : (detected.length >= 2 ? 'medium' : 'low')

  return {
    firstName,
    lastName,
    email: email || '',
    phone: phone || '',
    amount,
    submittedAt,
    confidence,
    method: 'regex',
  }
}

/** Fallback : cherche un email inline n'importe où dans le texte. */
function extractEmailInline(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  return match ? match[0] : null
}

// ---------------------------------------------------------------------------
// AI extraction (fallback)
// ---------------------------------------------------------------------------

async function extractWithAI(text: string): Promise<ParsedLead | null> {
  try {
    const { client, config } = await getLLMClient()

    const prompt = `Extract the following fields from a form notification text. Return ONLY valid JSON, no markdown.

Fields to extract:
- firstName: prospect's first/given name
- lastName: prospect's last/family name
- email: email address
- phone: phone number (clean, remove masks like **********)
- amount: loan amount as integer (the monetary value requested)
- submittedAt: ISO 8601 datetime of form submission

Text:
"""
${text.replace(/"""/g, "'''").slice(0, 2000)}
"""

Return JSON: { "firstName": "", "lastName": "", "email": "", "phone": "", "amount": null, "submittedAt": null }`

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    }, { timeout: 30_000 })

    const content = response.choices?.[0]?.message?.content
    if (!content) return null

    // Extraire le JSON de la réponse (peut être enveloppé dans des backticks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    const firstName = String(parsed.firstName || '').trim()
    const lastName = String(parsed.lastName || '').trim()
    const email = String(parsed.email || '').trim()
    const phone = String(parsed.phone || '').trim()
    const amount = parsed.amount ? parseInt(String(parsed.amount).replace(/[^\d]/g, ''), 10) : null
    const submittedAt = parsed.submittedAt || null

    // Valider qu'on a au minimum un nom
    if (!firstName && !lastName) return null

    // Déterminer la confiance
    const detected: string[] = []
    if (firstName) detected.push('firstName')
    if (lastName) detected.push('lastName')
    if (email) detected.push('email')
    if (phone) detected.push('phone')
    if (amount !== null) detected.push('amount')
    if (submittedAt) detected.push('submittedAt')

    const hasAllRequired = REQUIRED_FOR_HIGH.every((f) => detected.includes(f))
    const confidence: ParsedLead['confidence'] = hasAllRequired ? 'high' : (detected.length >= 2 ? 'medium' : 'low')

    return {
      firstName,
      lastName,
      email,
      phone,
      amount,
      submittedAt,
      confidence,
      method: 'ai',
    }
  } catch (err) {
    console.error('[parse-text] Erreur IA fallback:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const parseTextSchema = z.object({
  text: z.string().min(10).max(10000),
})

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth()
  if (deny) return deny

  const [data, error] = await parseBody(req, parseTextSchema)
  if (error) return error

  const text = data.text.trim()

  // 1. Essayer le regex en premier (rapide, pas de dépendance externe)
  let result = extractWithRegex(text)

  // 2. Si regex insuffisant ou low confidence → essayer l'IA
  if (!result || result.confidence === 'low') {
    const aiResult = await extractWithAI(text)
    // L'IA ne remplace le regex que si elle donne un meilleur résultat
    if (aiResult && (!result || aiResult.confidence !== 'low')) {
      result = aiResult
    } else if (!result) {
      result = aiResult
    }
  }

  // 3. Si toujours rien → erreur
  if (!result) {
    return errorResponse(
      'Impossible d\'extraire les informations de ce texte. Vérifiez le format ou collez un texte plus structuré.',
      'PARSE_FAILED',
      undefined,
      422,
    )
  }

  // 4. Construire le résultat avec les champs détectés/manquants
  const ALL_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'amount', 'submittedAt']
  const detectedFields = ALL_FIELDS.filter((f) => {
    if (f === 'submittedAt') return !!result!.submittedAt
    if (f === 'amount') return result!.amount !== null
    return !!result![f as keyof ParsedLead]
  })
  const missingFields = ALL_FIELDS.filter((f) => !detectedFields.includes(f))

  return successResponse({
    lead: result,
    rawText: text,
    detectedFields,
    missingFields,
  })
}
