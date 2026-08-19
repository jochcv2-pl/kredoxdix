'use client'

// =============================================================================
// Pagination — Contrôle de navigation partagé par toutes les vues paginées.
// =============================================================================
// Props :
//   page       — page courante (1-based)
//   totalPages — nombre total de pages (0 = masqué)
//   total      — nombre total d'éléments (optionnel, affiché)
//   loading    — désactive les boutons pendant le chargement
//   onChange   — callback (nouvelle page)
// =============================================================================
// Rendu : ← Précédent · Page X / Y (N éléments) · Suivant →
// Masqué si totalPages <= 1 (une seule page : rien à naviguer).
// =============================================================================

interface PaginationProps {
  page: number
  totalPages: number
  total?: number
  loading?: boolean
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, loading, onChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const prev = () => onChange(Math.max(1, page - 1))
  const next = () => onChange(Math.min(totalPages, page + 1))

  return (
    <div className="pg-bar">
      <button
        type="button"
        className="btn btn-secondary pg-btn"
        disabled={page <= 1 || loading}
        onClick={prev}
      >
        ← Précédent
      </button>
      <span className="pg-info">
        Page <b>{page}</b> / {totalPages}
        {typeof total === 'number' && total > 0 && (
          <span className="pg-total"> · {total.toLocaleString('fr-FR')} élément{total > 1 ? 's' : ''}</span>
        )}
      </span>
      <button
        type="button"
        className="btn btn-secondary pg-btn"
        disabled={page >= totalPages || loading}
        onClick={next}
      >
        Suivant →
      </button>
    </div>
  )
}
