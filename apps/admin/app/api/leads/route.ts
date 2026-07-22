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
import { prisma, LeadStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';

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
  createdAt: string;
  updatedAt: string;
}

// GET /api/leads — liste paginée filtrée.
export async function GET(req: NextRequest) {
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
