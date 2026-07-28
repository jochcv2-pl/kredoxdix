'use client'

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type ContactStatus = 'new' | 'contacted' | 'progress' | 'offer' | 'waiting' | 'client' | 'lost'

// Ordre canonique du pipeline (sans le terminal négatif "lost" qui ne se "traverse" pas).
const PIPELINE_ORDER: ContactStatus[] = [
  'new', 'contacted', 'progress', 'offer', 'waiting', 'client',
]

const STATUS_CONFIG: Record<ContactStatus, { label: string; class: string }> = {
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

const SOURCE_LABELS: Record<string, string> = {
  fr: 'FR',
  be: 'BE',
  ch: 'CH',
  lu: 'LU',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  nl: 'NL',
}

interface Contact {
  id: string
  firstName: string
  lastName: string
  initials: string
  email: string | null
  phone: string
  ville: string
  pays: string
  source: string
  recu: string          // date formatée pour affichage
  elapsedMin: number    // minutes écoulées depuis la soumission
  ackSent: boolean      // email de bienvenue envoyé ?
  relanceCount: number  // nombre de relances envoyées
  loanType: string
  amount: number | null
  status: ContactStatus
  validateur?: string
}

interface ApiLead {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string
  city: string
  country: string
  loanType: string
  amount: number
  durationYears: number
  monthlyPayment: number | null
  annualRate: number | null
  totalCost: number | null
  status: ContactStatus
  preferredLanguage: string
  sequenceActive: boolean
  relanceCount: number
  nextRelanceAt: string | null
  ackSentAt: string | null
  createdAt: string
  updatedAt: string
}

function makeInitials(firstName: string, lastName: string): string {
  const f = (firstName?.[0] ?? '').toUpperCase()
  const l = (lastName?.[0] ?? '').toUpperCase()
  return (f + l) || '??'
}

function formatDateRecu(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  } catch {
    return '—'
  }
}

function calcElapsedMin(iso: string): number {
  try {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  } catch {
    return 0
  }
}

function formatElapsed(min: number): string {
  if (min < 1) return "À l'instant"
  if (min < 60) return `il y a ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}

function mapLeadToContact(lead: ApiLead): Contact {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    initials: makeInitials(lead.firstName, lead.lastName),
    email: lead.email,
    phone: lead.phone,
    ville: lead.city || '—',
    pays: SOURCE_LABELS[lead.country] ?? lead.country ?? '—',
    source: 'Formulaire site',
    recu: formatDateRecu(lead.createdAt),
    elapsedMin: calcElapsedMin(lead.createdAt),
    ackSent: !!lead.ackSentAt,
    relanceCount: lead.relanceCount ?? 0,
    loanType: LOAN_TYPE_LABELS[lead.loanType] ?? lead.loanType,
    amount: lead.amount,
    status: lead.status,
  }
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const [fileName, setFileName] = useState<string>('')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [triInstructions, setTriInstructions] = useState(
    "Priorise les prospects avec un montant supérieur à 150 000 € et une situation Salarié CDI. Classe en second les indépendants. Écarte les demandes sans email valide. Marque en priorité haute les prêts immobiliers."
  )
  const [triResult, setTriResult] = useState<{ leads: Array<{ id: string; firstName: string; lastName: string; amount: number; score: number; scoreReason: string; email: string | null }> } | null>(null)
  const [triLoading, setTriLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [validateTarget, setValidateTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // ----- Chargement initial -----
  const fetchContacts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/leads?pageSize=200')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const leads: ApiLead[] = Array.isArray(json?.data?.leads) ? json.data.leads : []
      setContacts(leads.map(mapLeadToContact))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
      setContacts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  // ----- Helpers de mise à jour persistée -----
  const patchStatus = async (id: string, status: ContactStatus): Promise<boolean> => {
    setPendingId(id)
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        throw new Error(errJson?.error || `HTTP ${res.status}`)
      }
      // Update optimiste : on ne recharge pas toute la liste.
      setContacts((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status, validateur: status === 'client' ? 'Thomas B.' : c.validateur } : c,
        ),
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de mise à jour')
      return false
    } finally {
      setPendingId(null)
    }
  }

  const advanceStatus = async (id: string, direction: 1 | -1) => {
    const current = contacts.find((c) => c.id === id)
    if (!current) return
    if (current.status === 'client' || current.status === 'lost') return
    const idx = PIPELINE_ORDER.indexOf(current.status)
    if (idx === -1) return
    const next = Math.max(0, Math.min(PIPELINE_ORDER.length - 1, idx + direction))
    const newStatus = PIPELINE_ORDER[next]
    if (newStatus === current.status) return
    await patchStatus(id, newStatus)
  }

  const filteredContacts = statusFilter === 'all'
    ? contacts
    : contacts.filter((c) => c.status === statusFilter)

  return (
    <section className="view" id="contacts">
      <div className="info-band">
        <div className="imark">i</div>
        <div>
          Un contact entre comme <b>prospect</b> dès qu&apos;il remplit le formulaire.{' '}
          <b>Seul l&apos;administrateur</b> peut le valider comme client — les agents IA n&apos;ont
          pas ce droit. La validation débloque le suivi client complet.
        </div>
      </div>

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
          <span className="link" onClick={fetchContacts}>Réessayer</span>
        </div>
      )}

      {/* Pipeline visuel des statuts */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h3>Pipeline de prospection</h3>
          <span className="link" onClick={fetchContacts}>Actualiser</span>
        </div>
        <div className="panel-body" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {(Object.keys(STATUS_CONFIG) as ContactStatus[]).map((s, i) => {
              const count = contacts.filter((c) => c.status === s).length
              const cfg = STATUS_CONFIG[s]
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                    className={`badge ${cfg.class}`}
                    style={{ cursor: 'pointer', opacity: statusFilter === s || statusFilter === 'all' ? 1 : 0.5 }}
                  >
                    <span className="badge-dot"></span>
                    {cfg.label} ({count})
                  </button>
                  {i < (Object.keys(STATUS_CONFIG) as ContactStatus[]).length - 1 && (
                    <span style={{ color: 'var(--slate-light)', fontSize: 14 }}>→</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-head">
            <h3>Importer des prospects</h3>
          </div>
          <div className="panel-body" style={{ paddingTop: 16 }}>
            <label className="dropzone" style={{ marginBottom: 0, cursor: 'pointer' }}>
              <svg className="dz-ico" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
              <div className="dz-title">Déposez un fichier .csv ou .xlsx</div>
              <div className="dz-sub">Colonnes attendues : nom, email, téléphone, ville, montant…</div>
              <div className="dz-file">{fileName && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={16} /> {fileName}</span>}</div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setFileName(f.name)
                }}
              />
            </label>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-head">
            <h3>Instructions de tri (IA)</h3>
          </div>
          <div className="panel-body" style={{ paddingTop: 16 }}>
            <p className="field-hint">
              Décrivez comment l&apos;IA doit trier et prioriser les prospects importés. Elle
              applique ces règles sans jamais contacter le prospect sans validation.
            </p>
            <textarea
              className="body-editor"
              style={{ minHeight: 120 }}
              value={triInstructions}
              onChange={(e) => setTriInstructions(e.target.value)}
            />
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              disabled={triLoading}
              onClick={async () => {
                setTriLoading(true)
                setTriResult(null)
                try {
                  const res = await fetch('/api/leads/sort', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instructions: triInstructions }),
                  })
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                  const json = await res.json()
                  setTriResult({ leads: json.data.leads })
                } catch {
                  setError('Erreur lors du tri IA')
                } finally {
                  setTriLoading(false)
                }
              }}
            >
              {triLoading ? 'Tri en cours…' : 'Trier avec l\'IA'}
            </button>
            {triResult && triResult.leads.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--slate)' }}>
                  {triResult.leads.length} prospects classés par priorité
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {triResult.leads.slice(0, 10).map((lead, i) => (
                    <div
                      key={lead.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: 'var(--bg-soft, rgba(0,0,0,0.02))',
                        border: '1px solid var(--line-soft)',
                      }}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                        background: lead.score >= 70 ? 'rgba(46,204,113,0.15)' : lead.score >= 40 ? 'rgba(241,196,15,0.15)' : 'rgba(149,165,166,0.15)',
                        color: lead.score >= 70 ? '#27ae60' : lead.score >= 40 ? '#f39c12' : '#7f8c8d',
                      }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 13 }}>{lead.firstName} {lead.lastName}</b>
                        <span style={{ fontSize: 12, color: 'var(--slate-light)', marginLeft: 8 }}>
                          {lead.amount.toLocaleString('fr-FR')}€ {!lead.email && '· Sans email'}
                        </span>
                        {lead.scoreReason && (
                          <div style={{ fontSize: 11, color: 'var(--slate-light)' }}>{lead.scoreReason}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: lead.score >= 70 ? '#27ae60' : lead.score >= 40 ? '#f39c12' : '#7f8c8d',
                      }}>
                        {lead.score}
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.2)' }}
                          title="Convertir en client"
                          onClick={() => patchStatus(lead.id, 'client').then((ok) => {
                            if (ok) {
                              setTriResult((prev) => prev ? { ...prev, leads: prev.leads.filter((l) => l.id !== lead.id) } : null)
                            }
                          })}
                        >
                          Client
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(43,139,222,0.1)', color: '#1E6FB8', border: '1px solid rgba(43,139,222,0.2)' }}
                          title="Garder en prospect actif"
                          onClick={() => patchStatus(lead.id, 'contacted').then((ok) => {
                            if (ok) {
                              setTriResult((prev) => prev ? { ...prev, leads: prev.leads.filter((l) => l.id !== lead.id) } : null)
                            }
                          })}
                        >
                          Prospect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>
            Tous les contacts
            {statusFilter !== 'all' && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--slate)', marginLeft: 8 }}>
                · Filtré : {(STATUS_CONFIG[statusFilter as ContactStatus] ?? { label: statusFilter }).label}
                <span className="link" style={{ marginLeft: 8 }} onClick={() => setStatusFilter('all')}>✕ Réinitialiser</span>
              </span>
            )}
          </h3>
          <span className="link" onClick={() => setFilterModalOpen(true)}>Filtrer</span>
        </div>
        <div className="panel-body">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
              Chargement des contacts…
            </div>
          ) : filteredContacts.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--slate-light)', fontSize: 14 }}>
              Aucun contact pour ce filtre.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Ville</th>
                  <th>Pays</th>
                  <th>Source</th>
                  <th>Reçu le</th>
                  <th>Suivi</th>
                  <th>Statut</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c) => {
                  const cfg = STATUS_CONFIG[c.status] ?? { label: c.status, class: 'b-wait' }
                  const canAdvance = c.status !== 'client' && c.status !== 'lost'
                  const canGoBack = c.status !== 'new'
                  const isPending = pendingId === c.id
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="cust">
                          <div className="ini">{c.initials}</div>
                          <div>
                            <b>{c.firstName} {c.lastName}</b>
                            <small>{c.email || c.phone}</small>
                          </div>
                        </div>
                      </td>
                      <td>{c.ville}</td>
                      <td>{c.pays}</td>
                      <td>{c.source}</td>
                      <td>{c.recu}</td>
                      <td>
                        <div className="suivi-cell">
                          <span className={`suivi-item ${c.elapsedMin < 60 ? 'suivi-hot' : c.elapsedMin < 1440 ? 'suivi-warm' : 'suivi-cold'}`}>
                            <span className="suivi-dot"></span>
                            {formatElapsed(c.elapsedMin)}
                          </span>
                          <span className={`suivi-item ${c.ackSent ? 'suivi-ok' : 'suivi-pending'}`}>
                            {c.ackSent ? '✓ Bienvenue envoyé' : '✕ Bienvenue en attente'}
                          </span>
                          <span className={`suivi-item ${c.relanceCount > 0 ? 'suivi-ok' : 'suivi-muted'}`}>
                            {c.relanceCount > 0 ? `${c.relanceCount}/3 relances` : '0/3 relance'}
                          </span>
                        </div>
                      </td>
                      <td className="st">
                        <span className={`badge ${cfg.class}`}>
                          <span className="badge-dot"></span>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isPending && (
                            <span style={{ fontSize: 11, color: 'var(--slate-light)' }}>…</span>
                          )}
                          {canGoBack && !isPending && (
                            <button
                              className="step-btn step-back"
                              title="Reculer d'un statut"
                              onClick={() => advanceStatus(c.id, -1)}
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                          )}
                          {canAdvance ? (
                            !isPending && (
                              <>
                                <button
                                  className="step-btn step-fwd"
                                  title="Avancer d'un statut"
                                  onClick={() => advanceStatus(c.id, 1)}
                                >
                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                </button>
                                {c.status !== 'client' && (
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setValidateTarget({ id: c.id, name: `${c.firstName} ${c.lastName}` })}
                                  >
                                    Valider client
                                  </button>
                                )}
                              </>
                            )
                          ) : c.status === 'client' ? (
                            <span style={{ fontSize: 11, color: 'var(--slate-light)' }}>
                              Validé par {c.validateur ?? 'admin'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--slate-light)' }}>
                              Dossier perdu
                            </span>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Supprimer"
                            onClick={() => setDeleteTarget({ id: c.id, name: `${c.firstName} ${c.lastName}` })}
                            style={{ color: 'var(--red, #dc2626)', padding: '4px 8px' }}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        title="Filtrer les contacts"
      >
        <p className="field-hint">
          Appliquez des filtres pour affiner la liste des contacts. Les filtres sont cumulatifs.
        </p>
        <div className="modal-fg">
          <label>Statut</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="new">Nouveau</option>
            <option value="contacted">Contacté</option>
            <option value="progress">En cours</option>
            <option value="offer">Offre envoyée</option>
            <option value="waiting">En attente</option>
            <option value="client">Client</option>
            <option value="lost">Perdu</option>
          </select>
        </div>
        <div className="modal-fg">
          <label>Pays</label>
          <select>
            <option>Tous les pays</option>
            <option>France</option>
            <option>Suisse</option>
            <option>Belgique</option>
            <option>Portugal</option>
          </select>
        </div>
        <div className="modal-fg">
          <label>Source</label>
          <select>
            <option>Toutes les sources</option>
            <option>Formulaire site</option>
            <option>WhatsApp</option>
          </select>
        </div>
        <div className="modal-fg">
          <label>Date de réception</label>
          <select>
            <option>Toutes les dates</option>
            <option>Dernières 24h</option>
            <option>Derniers 7 jours</option>
            <option>Derniers 30 jours</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setFilterModalOpen(false)}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setFilterModalOpen(false)}
          >
            Appliquer les filtres
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!validateTarget}
        variant="warning"
        title="Valider en tant que client"
        message={<>Voulez-vous vraiment valider <strong>{validateTarget?.name}</strong> comme client ? Le prospect passera en statut « Client » et la séquence de relance sera arrêtée.</>}
        confirmLabel="Valider le client"
        onConfirm={async () => {
          if (validateTarget) {
            const ok = await patchStatus(validateTarget.id, 'client')
            if (ok) setValidateTarget(null)
          }
        }}
        onClose={() => setValidateTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer ce prospect"
        message={<>Supprimer définitivement <strong>{deleteTarget?.name}</strong> ? Toutes les données associées (emails, historique) seront effacées. Cette action est irréversible.</>}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              const res = await fetch(`/api/leads/${deleteTarget.id}`, { method: 'DELETE' })
              if (res.ok) {
                setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
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
