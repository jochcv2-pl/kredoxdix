'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type LeadStatus = 'new' | 'contacted' | 'progress' | 'offer' | 'waiting' | 'client' | 'lost'

interface Dossier {
  id: string
  firstName: string
  lastName: string
  email: string | null
  city: string
  country: string
  loanType: string
  amount: number
  durationYears: number
  annualRate: number | null
  monthlyPayment: number | null
  totalCost: number | null
  status: LeadStatus
  createdAt: string
}

interface ApiLead {
  id: string
  firstName: string
  lastName: string
  email: string | null
  city: string
  country: string
  loanType: string
  amount: number
  durationYears: number
  annualRate: number | null
  monthlyPayment: number | null
  totalCost: number | null
  status: LeadStatus
  createdAt: string
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; class: string }> = {
  new:        { label: 'Nouveau',         class: 'b-new' },
  contacted:  { label: 'Contacté',        class: 'b-contacted' },
  progress:   { label: 'En cours',        class: 'b-progress' },
  offer:      { label: 'Offre envoyée',   class: 'b-offer' },
  waiting:    { label: 'En attente',      class: 'b-wait' },
  client:     { label: 'Client',          class: 'b-client' },
  lost:       { label: 'Perdu',           class: 'b-lost' },
}

const LOAN_TYPE_LABELS: Record<string, string> = {
  immo:   'Immobilier',
  conso:  'Consommation',
  rachat: 'Rachat',
  pro:    'Professionnel',
  autre:  'Autre',
}

function makeInitials(firstName: string, lastName: string): string {
  const f = (firstName?.[0] ?? '').toUpperCase()
  const l = (lastName?.[0] ?? '').toUpperCase()
  return (f + l) || '??'
}

const COUNTRY_LABELS: Record<string, string> = {
  fr: 'France', be: 'Belgique', ch: 'Suisse', lu: 'Luxembourg',
  de: 'Allemagne', es: 'Espagne', it: 'Italie', pt: 'Portugal', nl: 'Pays-Bas',
}

function formatEuro(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('fr-FR') + ' €'
}

function formatRate(r: number | null | undefined): string {
  if (r === null || r === undefined) return '—'
  // 3,55 % (remplace le point décimal par la virule française).
  return r.toFixed(2).replace('.', ',') + ' %'
}

export default function Dossiers() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // Envoi manuel de l'offre (PDF amortissement en PJ).
  const [offerTarget, setOfferTarget] = useState<Dossier | null>(null)
  const [offerSending, setOfferSending] = useState(false)
  const [offerError, setOfferError] = useState<string | null>(null)

  const fetchDossiers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/leads?pageSize=100')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const leads: ApiLead[] = Array.isArray(json?.data?.leads) ? json.data.leads : []
      setDossiers(leads.map((l) => ({ ...l })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
      setDossiers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDossiers()
  }, [])

  // Envoi manuel de l'offre de prêt (POST /api/leads/[id]/send-offer).
  const handleSendOffer = async () => {
    if (!offerTarget) return
    setOfferSending(true)
    setOfferError(null)
    try {
      const res = await fetch(`/api/leads/${offerTarget.id}/send-offer`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const errData = json?.data ?? json
        throw new Error(errData?.error ?? errData?.message ?? `Échec (${res.status})`)
      }
      setOfferTarget(null)
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setOfferSending(false)
    }
  }

  return (
    <section className="view" id="dossiers">
      <div className="panel">
        <div className="panel-head">
          <h3>
            Tous les dossiers
            {!loading && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--slate)', marginLeft: 8 }}>
                · {dossiers.length} dossier{dossiers.length > 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <span className="link" onClick={fetchDossiers}>Actualiser</span>
        </div>
        <div className="panel-body">
          {error && (
            <div
              style={{
                background: 'rgba(192, 57, 43, 0.08)',
                color: '#c0392b',
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {error}{' '}
              <span className="link" onClick={fetchDossiers}>Réessayer</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
              Chargement des dossiers…
            </div>
          ) : dossiers.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--slate-light)', fontSize: 14 }}>
              Aucun dossier pour le moment.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Type</th>
                    <th>Montant</th>
                    <th>Durée</th>
                    <th>Taux</th>
                    <th>Mensualité</th>
                    <th>Coût total</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dossiers.map((d) => {
                    const cfg = STATUS_CONFIG[d.status] ?? { label: d.status, class: 'b-wait' }
                    return (
                      <tr key={d.id} className="tr-click">
                        <td>
                          <div className="cust">
                            <div className="ini">{makeInitials(d.firstName, d.lastName)}</div>
                            <div>
                              <b>{d.firstName} {d.lastName}</b>
                              <small>{d.city || '—'} · {COUNTRY_LABELS[d.country] ?? d.country}</small>
                            </div>
                          </div>
                        </td>
                        <td>{LOAN_TYPE_LABELS[d.loanType] ?? d.loanType}</td>
                        <td className="amount">{formatEuro(d.amount)}</td>
                        <td>{d.durationYears} ans</td>
                        <td>{formatRate(d.annualRate)}</td>
                        <td className="amount">{formatEuro(d.monthlyPayment)}</td>
                        <td className="amount">{formatEuro(d.totalCost)}</td>
                        <td>
                          <span className={`badge ${cfg.class}`}>
                            <span className="badge-dot"></span>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Envoyer l'offre maintenant (avec tableau d'amortissement PDF)"
                            disabled={!d.email}
                            onClick={() => { setOfferError(null); setOfferTarget(d) }}
                            style={{ color: '#059669', padding: '4px 8px', marginRight: 4 }}
                          >
                            <Icon name="send" size={15} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Supprimer"
                            onClick={() => setDeleteTarget({ id: d.id, name: `${d.firstName} ${d.lastName}` })}
                            style={{ color: 'var(--red, #dc2626)', padding: '4px 8px' }}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!offerTarget}
        variant="info"
        title="Envoyer l'offre maintenant"
        message={
          <>
            Envoyer l&apos;offre de prêt à <strong>{offerTarget?.firstName} {offerTarget?.lastName}</strong>{' '}
            (<strong>{offerTarget?.email ?? '—'}</strong>) ?
            <br />
            L&apos;email part immédiatement avec le tableau d&apos;amortissement en pièce jointe
            (si les données de prêt sont complètes). La date d&apos;expiration de l&apos;offre est
            recalculée à partir de maintenant, et la séquence automatique ne renverra pas l&apos;offre.
            {offerError && (
              <div style={{ marginTop: 10, color: '#c0392b', fontSize: 13 }}>
                {offerError}{' '}
                <span className="link" onClick={handleSendOffer}>Réessayer</span>
              </div>
            )}
          </>
        }
        confirmLabel={offerSending ? 'Envoi…' : 'Envoyer l\'offre'}
        onConfirm={handleSendOffer}
        onClose={() => { if (!offerSending) setOfferTarget(null) }}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer ce dossier"
        message={<>Supprimer définitivement le dossier de <strong>{deleteTarget?.name}</strong> ? Toutes les données associées seront effacées. Cette action est irréversible.</>}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              const res = await fetch(`/api/leads/${deleteTarget.id}`, { method: 'DELETE' })
              if (res.ok) {
                setDossiers((prev) => prev.filter((d) => d.id !== deleteTarget.id))
                setDeleteTarget(null)
              }
            } catch { /* ignore */ }
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  )
}
