import { getActiveLoanTypes } from '@kredix/db'
import { successResponse } from '../validators'

// GET /api/loan-types — publique (pour le formulaire du site).
// Retourne les types de prêt actifs triés par ordre d'affichage.
export async function GET() {
  const types = await getActiveLoanTypes()
  return successResponse(types)
}
