interface EmailHeaderProps {
  bannerVisible?: boolean
  onRemoveBanner?: () => void
}

export function EmailHeader({ bannerVisible = true, onRemoveBanner }: EmailHeaderProps) {
  if (!bannerVisible) return null

  return (
    <div className="email-banner-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element -- banner email, <img> requis (pas d'optimisation Next pour les emails) */}
      <img src="/email-banner.jpg" alt="Kredix — Courtier en financement" className="email-banner-img" />
      {onRemoveBanner && (
        <button className="email-banner-remove" title="Supprimer la bannière" onClick={onRemoveBanner}>
          ×
        </button>
      )}
    </div>
  )
}
