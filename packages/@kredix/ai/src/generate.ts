import { prisma } from '@kredix/db';
import { getLLMClient } from './client';

// =============================================================================
// generate.ts — Génération d'email par l'agent IA.
// =============================================================================
// Flow :
//   1. Charge l'agent (par rôle) → systemPrompt + memories + guardrails
//   2. Charge les settings IA (modèle, température…) via getLLMClient()
//   3. Construit le contexte utilisateur (données lead, historique, angle relance)
//   4. Appelle le LLM (format JSON imposé : { subject, bodyText })
//   5. Retourne le résultat ou fallback si l'IA échoue
//
// Sécurité :
//   - Le systemPrompt est verrouillé (non éditable via API)
//   - Les données sensibles (montant, nom) sont injectées en contexte user, pas system
//   - Le guardrail "max_relances: 3" est respecté par le cron (pas par l'IA)

export interface GenerateEmailInput {
  /** Rôle de l'agent à invoquer (accueil, offre, relance, tri, seo). */
  agentRole: string;
  /** Données du lead/prospect pour personnaliser l'email. */
  leadContext: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
    preferredLanguage?: string;
    loanType?: string;
    amount?: number;
    durationYears?: number;
    monthlyPayment?: number;
    annualRate?: number;
    employmentStatus?: string;
    relanceCount?: number;
    notes?: string;
  };
  /** Type d'email à générer (reception_ack, relance_1, relance_2, relance_3, offer…). */
  trigger: string;
  /** Instructions libres de l'admin pour guider la génération (optionnel). */
  userPrompt?: string;
  /** Sujet du template de base (fallback si l'IA ne retourne pas de sujet). */
  fallbackSubject?: string;
  /** Corps du template de base (fallback si l'IA échoue). */
  fallbackBody?: string;
}

export interface GenerateEmailOutput {
  subject: string;
  bodyText: string;
  html?: string;
  /** true si le contenu vient de l'IA, false si c'est le fallback template. */
  generated: boolean;
  /** Message d'erreur si fallback (IA indisponible/mal configurée). */
  warning?: string;
}

/**
 * Génère un email personnalisé via l'agent IA.
 * Si l'IA échoue (pas de clé API, endpoint down, erreur parsing), retourne le fallback.
 */
export async function generateEmail(input: GenerateEmailInput): Promise<GenerateEmailOutput> {
  const { agentRole, leadContext, trigger, userPrompt, fallbackSubject = '', fallbackBody = '' } = input;

  try {
    // 1. Charger l'agent (systemPrompt + memories).
    const agent = await prisma.agent.findUnique({
      where: { role: agentRole as never },
      include: { memories: true },
    });

    if (!agent || !agent.isActive) {
      return fallback(input, `Agent '${agentRole}' introuvable ou inactif`);
    }

    // 2. Charger le client LLM + config.
    const { client, config } = await getLLMClient();

    // 3. Construire le system prompt (verrouillé + memories injectées).
    const memoriesText = agent.memories.length > 0
      ? agent.memories.map((m: { key: string; value: string }) => `- ${m.key}: ${m.value}`).join('\n')
      : '';
    const guardrailsText = agent.guardrails
      ? Object.entries(agent.guardrails as Record<string, string>)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n')
      : '';

    const systemPrompt = `${agent.systemPrompt}

${memoriesText ? `MÉMOIRE DE L'AGENT :\n${memoriesText}\n` : ''}
${guardrailsText ? `GARDE-FOUS :\n${guardrailsText}\n` : ''}
FORMAT DE RÉPONSE (OBLIGATOIRE) :
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après :
{
  "subject": "Objet de l'email (concis, professionnel, sans emojis)",
  "bodyText": "Corps de l'email en texte brut (paragraphes séparés par \\n\\n, signature incluse)"
}

La langue de l'email DOIT être : ${leadContext.preferredLanguage || 'fr'}.`;

    // 4. Construire le contexte utilisateur (données lead + prompt admin).
    const userInfo = buildUserContext(leadContext, trigger, userPrompt);

    // 5. Appeler le LLM (timeout 45s pour éviter les 504 côté UI).
    const completion = await client.chat.completions.create(
      {
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInfo },
        ],
      },
      { timeout: 45_000 },
    );

    const rawContent = completion.choices[0]?.message?.content?.trim() || '';

    // 6. Parser la sortie JSON.
    const parsed = parseEmailJson(rawContent);

    if (!parsed) {
      return fallback(input, 'IA: format de réponse invalide (JSON non parsable)');
    }

    return {
      subject: parsed.subject || fallbackSubject,
      bodyText: parsed.bodyText || fallbackBody,
      generated: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return fallback(input, `IA: ${msg}`);
  }
}

/**
 * Construit le prompt utilisateur avec les données du lead.
 */
function buildUserContext(
  lead: GenerateEmailInput['leadContext'],
  trigger: string,
  userPrompt?: string,
): string {
  const parts: string[] = [];

  parts.push(`TÂCHE : Rédige un email pour le trigger "${trigger}".`);

  // Instructions libres de l'admin (prioritaires sur les données génériques).
  if (userPrompt?.trim()) {
    parts.push(`\nINSTRUCTIONS SPÉCIFIQUES DE L'ADMINISTRATEUR :`);
    parts.push(userPrompt.trim());
  }

  parts.push(`\nPROSPECT :`);
  parts.push(`- Prénom : ${lead.firstName}`);
  if (lead.lastName) parts.push(`- Nom : ${lead.lastName}`);
  if (lead.city) parts.push(`- Ville : ${lead.city}`);
  if (lead.country) parts.push(`- Pays : ${lead.country}`);
  if (lead.loanType) parts.push(`- Type de prêt : ${lead.loanType}`);
  if (lead.amount) parts.push(`- Montant demandé : ${lead.amount.toLocaleString('fr-FR')} €`);
  if (lead.durationYears) parts.push(`- Durée : ${lead.durationYears} ans`);
  if (lead.monthlyPayment) parts.push(`- Mensualité estimée : ${lead.monthlyPayment} €/mois`);
  if (lead.annualRate) parts.push(`- Taux indicatif : ${lead.annualRate}%`);
  if (lead.employmentStatus) parts.push(`- Situation professionnelle : ${lead.employmentStatus}`);
  if (lead.relanceCount !== undefined && lead.relanceCount > 0) {
    parts.push(`- Numéro de relance : ${lead.relanceCount}/3`);
  }
  if (lead.notes) parts.push(`- Notes internes : ${lead.notes}`);

  // Angle selon le numéro de relance.
  if (trigger.startsWith('relance_')) {
    const angles: Record<number, string> = {
      1: 'ANGLE : Bienveillant — prendre des nouvelles, proposer de l\'aide.',
      2: 'ANGLE : Bénéfices — rappeler les avantages de l\'offre (taux, rapidité, économies).',
      3: 'ANGLE : Urgence douce — dernière relance, l\'offre expire bientôt.',
    };
    const angle = angles[lead.relanceCount || 0];
    if (angle) parts.push(`\n${angle}`);
  }

  parts.push(`\nRédige un email professionnel, concis (max 150 mots), personnalisé pour ce prospect.`);

  return parts.join('\n');
}

/**
 * Parse la sortie JSON du LLM (tolérant : extrait le JSON même s'il y a du texte autour).
 */
function parseEmailJson(raw: string): { subject: string; bodyText: string } | null {
  // Tentative directe.
  try {
    const parsed = JSON.parse(raw);
    if (parsed.subject && parsed.bodyText) return parsed;
  } catch {
    // Continue — essaie d'extraire le JSON.
  }

  // Extraction : cherche le premier { ... } valide.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.subject && parsed.bodyText) return parsed;
    } catch {
      // Ignore.
    }
  }

  return null;
}

function fallback(input: GenerateEmailInput, warning: string): GenerateEmailOutput {
  return {
    subject: input.fallbackSubject || '',
    bodyText: input.fallbackBody || '',
    generated: false,
    warning,
  };
}
