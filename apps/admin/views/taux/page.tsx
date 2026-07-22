'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Types — alignés sur le modèle Prisma BankPartner + Rate.
// =============================================================================

interface Bank {
  id: string
  name: string
  slug: string
  isActive: boolean
  displayOrder: number
  _count?: { rates: number }
}

interface Rate {
  id: string
  bankId: string
  bank?: { id: string; name: string; slug: string }
  loanType: string
  amountMin: number
  amountMax: number
  annualRate: number
  isActive: boolean
  validFrom: string
}

// Types de prêt connus (la liste est ouverte côté DB — string libre).
const LOAN_TYPES = ['immo', 'conso', 'rachat', 'pro', 'autre'] as const

const LOAN_LABEL: Record<string, string> = {
  immo: 'Prêt immobilier',
  conso: 'Prêt à la consommation',
  rachat: 'Rachat de crédits',
  pro: 'Prêt professionnel',
  autre: 'Autre',
}

// Formatage montant en euros FR.
function fmtEuros(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' €'
}

// =============================================================================
// Composant principal
// =============================================================================

export default function Taux() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedBankId, setSelectedBankId] = useState<string>('')
  const [newRateModalOpen, setNewRateModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Rate | null>(null)

  // ---------------------------------------------------------------------------
  // Chargement initial — banks + rates en parallèle.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [bRes, rRes] = await Promise.all([
          fetch('/api/banks'),
          fetch('/api/rates'),
        ])
        if (!bRes.ok || !rRes.ok) throw new Error('Échec chargement')
        const bJson = await bRes.json()
        const rJson = await rRes.json()
        const bList: Bank[] = bJson.data ?? bJson
        const rList: Rate[] = rJson.data ?? rJson

        if (cancelled) return
        setBanks(bList)
        setRates(rList)
        setSelectedBankId(bList[0]?.id ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Rates filtrés par banque sélectionnée.
  const ratesForBank = useMemo(
    () => rates.filter((r) => r.bankId === selectedBankId),
    [rates, selectedBankId],
  )

  // Groupage par loanType pour l'affichage en tableaux séparés.
  const groupedByType = useMemo(() => {
    const map = new Map<string, Rate[]>()
    for (const r of ratesForBank) {
      const arr = map.get(r.loanType) ?? []
      arr.push(r)
      map.set(r.loanType, arr)
    }
    // Tri interne par palier montant croissant.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.amountMin - b.amountMin)
    }
    return map
  }, [ratesForBank])

  const selectedBank = banks.find((b) => b.id === selectedBankId)

  // ---------------------------------------------------------------------------
  // Actions API
  // ---------------------------------------------------------------------------

  const createRate = async (payload: {
    loanType: string
    amountMin: number
    amountMax: number
    annualRate: number
    isActive: boolean
  }) => {
    setError(null)
    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, bankId: selectedBankId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? `Échec création (${res.status})`)
      }
      const created: Rate = (await res.json()).data ?? (await res.json())
      setRates((prev) => [...prev, created])
      setNewRateModalOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  const updateRate = async (id: string, patch: Partial<Pick<Rate, 'annualRate' | 'isActive'>>) => {
    setError(null)
    try {
      const res = await fetch(`/api/rates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? 'Échec mise à jour')
      }
      const updated: Rate = (await res.json()).data ?? (await res.json())
      setRates((prev) => prev.map((r) => (r.id === id ? updated : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  const deleteRate = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/rates/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Échec suppression')
      setRates((prev) => prev.filter((r) => r.id !== id))
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <section className="view" id="taux">
        <p className="field-hint">Chargement des taux…</p>
      </section>
    )
  }

  return (
    <section className="view" id="taux">
      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      <div className="rate-note">
        <b>Ces taux alimentent directement le simulateur du site.</b> Chaque
        banque partenaire définit ses propres paliers par type de prêt et par
        tranche de montant. Le simulateur compare toutes les banques actives
        pour afficher la meilleure offre au prospect.
      </div>

      {/* Sélecteur de banque + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div className="fg" style={{ marginBottom: 0, minWidth: 280 }}>
          <label>Banque partenaire</label>
          <select
            value={selectedBankId}
            onChange={(e) => setSelectedBankId(e.target.value)}
            style={{ minWidth: 260 }}
          >
            {banks.length === 0 && <option value="">— Aucune banque —</option>}
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b._count?.rates !== undefined ? `(${b._count.rates} taux)` : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setNewRateModalOpen(true)}
          disabled={!selectedBankId}
        >
          + Ajouter un taux
        </button>
        {selectedBank && (
          <span style={{ fontSize: 12, color: 'var(--slate)' }}>
            {ratesForBank.length} taux · {groupedByType.size} type{groupedByType.size > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {banks.length === 0 && (
        <p className="field-hint" style={{ padding: '20px 0', fontStyle: 'italic' }}>
          Aucune banque partenaire configurée. Ajoutez-en une via le seed ou une future interface d&apos;administration.
        </p>
      )}

      {selectedBank && ratesForBank.length === 0 && (
        <p className="field-hint" style={{ padding: '20px 0', fontStyle: 'italic' }}>
          Aucun taux défini pour <b>{selectedBank.name}</b>. Cliquez sur « + Ajouter un taux » pour commencer.
        </p>
      )}

      {/* Tables par type de prêt */}
      <div className="grid-2">
        {LOAN_TYPES.filter((t) => groupedByType.has(t)).map((loanType) => {
          const list = groupedByType.get(loanType) ?? []
          return (
            <div className="panel" key={loanType}>
              <div className="panel-head">
                <h3>{LOAN_LABEL[loanType] ?? loanType}</h3>
                <span style={{ fontSize: 12, color: 'var(--slate)' }}>{list.length} palier{list.length > 1 ? 's' : ''}</span>
              </div>
              <div className="panel-body">
                <table>
                  <thead>
                    <tr>
                      <th>Palier de montant</th>
                      <th>Taux annuel</th>
                      <th>État</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <RateRow
                        key={r.id}
                        rate={r}
                        onUpdate={(patch) => updateRate(r.id, patch)}
                        onDelete={() => setDeleteTarget(r)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {/* Types non standards (si loanType hors liste connue) */}
        {[...groupedByType.keys()]
          .filter((t) => !LOAN_TYPES.includes(t as (typeof LOAN_TYPES)[number]))
          .map((loanType) => {
            const list = groupedByType.get(loanType) ?? []
            return (
              <div className="panel" key={loanType}>
                <div className="panel-head">
                  <h3>{LOAN_LABEL[loanType] ?? loanType}</h3>
                  <span style={{ fontSize: 12, color: 'var(--slate)' }}>{list.length} palier{list.length > 1 ? 's' : ''}</span>
                </div>
                <div className="panel-body">
                  <table>
                    <thead>
                      <tr>
                        <th>Palier de montant</th>
                        <th>Taux annuel</th>
                        <th>État</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <RateRow
                          key={r.id}
                          rate={r}
                          onUpdate={(patch) => updateRate(r.id, patch)}
                          onDelete={() => setDeleteTarget(r)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
      </div>

      {/* =========================================================================
          MODAL NEW RATE
          ========================================================================= */}
      <Modal
        isOpen={newRateModalOpen}
        onClose={() => setNewRateModalOpen(false)}
        title={`Nouveau taux — ${selectedBank?.name ?? ''}`}
      >
        <NewRateForm
          onCancel={() => setNewRateModalOpen(false)}
          onCreate={createRate}
        />
      </Modal>

      {/* =========================================================================
          DELETE CONFIRM
          ========================================================================= */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer le taux"
        message={
          <>
            Voulez-vous vraiment supprimer le taux{' '}
            <strong>{deleteTarget?.annualRate.toFixed(2)} %</strong>{' '}
            ({LOAN_LABEL[deleteTarget?.loanType ?? ''] ?? deleteTarget?.loanType},{' '}
            {deleteTarget ? fmtEuros(deleteTarget.amountMin) : ''} –{' '}
            {deleteTarget ? fmtEuros(deleteTarget.amountMax) : ''}) ?
            {' '}Cette action est irréversible.
          </>
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={() => { if (deleteTarget) deleteRate(deleteTarget.id) }}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  )
}

// =============================================================================
// Sous-composant : ligne éditable d'un taux
// =============================================================================

function RateRow({
  rate,
  onUpdate,
  onDelete,
}: {
  rate: Rate
  onUpdate: (patch: Partial<Pick<Rate, 'annualRate' | 'isActive'>>) => void
  onDelete: () => void
}) {
  const [rateInput, setRateInput] = useState(String(rate.annualRate))

  // Resync si la valeur change côté serveur (après update optimiste).
  useEffect(() => {
    setRateInput(String(rate.annualRate))
  }, [rate.annualRate])

  return (
    <tr>
      <td style={{ fontSize: 13 }}>
        {fmtEuros(rate.amountMin)} – {fmtEuros(rate.amountMax)}
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            className="rate-input"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={() => {
              const parsed = Number(rateInput.replace(',', '.'))
              if (!Number.isNaN(parsed) && parsed !== rate.annualRate) {
                onUpdate({ annualRate: parsed })
              } else {
                setRateInput(String(rate.annualRate))
              }
            }}
            style={{ width: 70 }}
          /> %
        </div>
      </td>
      <td>
        <span
          className={rate.isActive ? 'pill-on' : 'pill-off'}
          style={{ cursor: 'pointer' }}
          onClick={() => onUpdate({ isActive: !rate.isActive })}
          title={rate.isActive ? 'Cliquer pour désactiver' : 'Cliquer pour activer'}
        >
          {rate.isActive ? 'Actif' : 'Inactif'}
        </span>
      </td>
      <td>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '4px 8px', color: 'var(--red)' }}
          onClick={onDelete}
        >
          ×
        </button>
      </td>
    </tr>
  )
}

// =============================================================================
// Sous-composant : formulaire nouveau taux
// =============================================================================

function NewRateForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (payload: {
    loanType: string
    amountMin: number
    amountMax: number
    annualRate: number
    isActive: boolean
  }) => void
}) {
  const [loanType, setLoanType] = useState<string>('immo')
  const [amountMin, setAmountMin] = useState('0')
  const [amountMax, setAmountMax] = useState('500000')
  const [annualRate, setAnnualRate] = useState('3.5')
  const [isActive, setIsActive] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = () => {
    const min = Number(amountMin)
    const max = Number(amountMax)
    const rate = Number(annualRate.replace(',', '.'))
    if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(rate)) {
      setFormError('Montants et taux doivent être numériques.')
      return
    }
    if (min > max) {
      setFormError('Le montant minimum doit être ≤ maximum.')
      return
    }
    if (rate < 0 || rate > 30) {
      setFormError('Le taux doit être entre 0 et 30 %.')
      return
    }
    onCreate({ loanType, amountMin: min, amountMax: max, annualRate: rate, isActive })
  }

  return (
    <>
      <p className="field-hint">
        Définissez un palier de montant et le taux associé. Le simulateur l&apos;utilisera
        pour les demandes dont le montant est compris entre min et max (inclus).
      </p>
      {formError && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 12 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{formError}</div>
        </div>
      )}
      <div className="modal-fg">
        <label>Type de prêt</label>
        <select value={loanType} onChange={(e) => setLoanType(e.target.value)}>
          {LOAN_TYPES.map((t) => (
            <option key={t} value={t}>{LOAN_LABEL[t]}</option>
          ))}
        </select>
      </div>
      <div className="frow">
        <div className="modal-fg">
          <label>Montant minimum (€)</label>
          <input
            type="number"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            min={0}
            autoFocus
          />
        </div>
        <div className="modal-fg">
          <label>Montant maximum (€)</label>
          <input
            type="number"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            min={0}
          />
        </div>
      </div>
      <div className="modal-fg">
        <label>Taux annuel (%)</label>
        <input
          type="text"
          value={annualRate}
          onChange={(e) => setAnnualRate(e.target.value)}
          placeholder="Ex : 3.5"
        />
      </div>
      <div className="modal-fg">
        <label>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: 'auto', marginRight: 8 }}
          />
          Taux actif (utilisé par le simulateur)
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary" onClick={submit}>Créer le taux</button>
      </div>
    </>
  )
}
