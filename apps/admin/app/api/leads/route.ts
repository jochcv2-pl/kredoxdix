// =============================================================================
// /api/leads — Liste paginée des leads (vue CRM admin).
// =============================================================================
// Filtres supportés :
//   - status   : filtre par LeadStatus exact (new, contacted, progress, offer, waiting, client, lost)
//   - search   : recherche fullName/email/phone/ville/city (insensible à la casse)
//   - loanType : filtre par type de prêt (immo, conso, rachat, pro, autre)
//
// Réponse : { data: Lead[], pagination: {...} }
//
// Pas d'auth pour l'instant (Zitadel futur). Cohérent avec les autres routes admin.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, LeadStatus, createNotification } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

const DAY = 24 * 60 * 60 * 1000;
const WELCOME_DELAY_MS = 5 * 60 * 1000; // 5 minutes

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'new',
  'contacted',
  'progress',
  'offer',
  'waiting',
  'client',
  'lost',
]);

interface LeadListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  city: string;
  country: string;
  loanType: string;
  amount: number;
  durationYears: number;
  monthlyPayment: number | null;
  annualRate: number | null;
  totalCost: number | null;
  employmentStatus: string;
  status: string;
  preferredLanguage: string;
  sequenceActive: boolean;
  relanceCount: number;
  nextRelanceAt: string | null;
  ackSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// GET /api/leads — liste paginée filtrée.
export async function GET(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get('pageSize')) || Number(searchParams.get('limit')) || 50),
    );

    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const loanType = searchParams.get('loanType')?.trim();

    // Construction du where Prisma.
    const where: Record<string, unknown> = {};

    if (status && VALID_STATUSES.has(status)) {
      where.status = status as LeadStatus;
    }
    if (loanType) {
      where.loanType = loanType;
    }
    if (search) {
      // Insensible à la casse via mode: insensitive (PostgreSQL).
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.lead.count({ where }),
    ]);

    const data: LeadListItem[] = leads.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      email: l.email,
      phone: l.phone,
      city: l.city,
      country: l.country,
      loanType: l.loanType,
      amount: l.amount,
      durationYears: l.durationYears,
      monthlyPayment: l.monthlyPayment,
      annualRate: l.annualRate,
      totalCost: l.totalCost,
      employmentStatus: l.employmentStatus,
      status: l.status,
      preferredLanguage: l.preferredLanguage,
      sequenceActive: l.sequenceActive,
      relanceCount: l.relanceCount,
      nextRelanceAt: l.nextRelanceAt ? l.nextRelanceAt.toISOString() : null,
      ackSentAt: l.ackSentAt ? l.ackSentAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }));

    return successResponse({
      leads: data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('[GET /api/leads] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// =============================================================================
// POST /api/leads — Création manuelle d'un lead depuis le CRM admin.
// =============================================================================
// L'admin saisit les informations du prospect. Le lead est créé en statut "new"
// sans séquence de relance automatique (l'admin décide quand l'activer).
// =============================================================================

const createLeadAdminSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1).max(40),
  city: z.string().min(1).max(120),
  street: z.string().max(200).optional().or(z.literal('')),
  zipCode: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(10).default('FR'),
  loanType: z.string().min(1).max(60),
  amount: z.number().int().min(1),
  durationYears: z.number().int().min(1).max(40),
  monthlyPayment: z.number().int().min(0).optional(),
  annualRate: z.number().min(0).max(100).optional(),
  totalCost: z.number().int().min(0).optional(),
  employmentStatus: z.string().max(120).default('Non précisé'),
  preferredLanguage: z.string().max(10).default('fr'),
  notes: z.string().optional(),
  activateSequence: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;

  const [data, error] = await parseBody(req, createLeadAdminSchema);
  if (error) return error;

  try {
    const now = new Date();
    const seqDates = data.activateSequence ? {
      recallDueAt: new Date(now.getTime() + 2 * DAY),
      sequenceActive: true,
      sequenceStartedAt: now,
      nextRelanceAt: new Date(now.getTime() + WELCOME_DELAY_MS),
      relanceCount: 0,
    } : {};

    const lead = await prisma.lead.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone,
        city: data.city,
        street: data.street || null,
        zipCode: data.zipCode || null,
        country: data.country,
        loanType: data.loanType,
        amount: data.amount,
        durationYears: data.durationYears,
        monthlyPayment: data.monthlyPayment ?? null,
        annualRate: data.annualRate ?? null,
        totalCost: data.totalCost ?? null,
        employmentStatus: data.employmentStatus,
        preferredLanguage: data.preferredLanguage,
        notes: data.notes || null,
        status: LeadStatus.new,
        assignedToId: admin!.id,
        ...seqDates,
      },
    });

    // Notification : nouveau dossier créé manuellement
    await createNotification({
      type: 'new_prospect',
      title: 'Nouveau dossier (création manuelle)',
      message: `${lead.firstName} ${lead.lastName} — ${lead.loanType} de ${lead.amount.toLocaleString('fr-FR')}€.`,
      icon: 'user-plus',
      severity: 'info',
      linkUrl: `/leads?id=${lead.id}`,
      relatedEntityId: lead.id,
    });

    return successResponse(lead, 201);
  } catch (err) {
    console.error('[POST /api/leads] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
