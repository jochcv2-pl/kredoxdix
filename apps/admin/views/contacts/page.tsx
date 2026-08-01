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
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; errors: number; message: string } | null>(null)
  const [csvSortLoading, setCsvSortLoading] = useState(false)
  const [csvSortResults, setCsvSortResults] = useState<Array<{
    index: number; firstName: string; lastName: string; email: string; phone: string
    city: string; amount: number; loanType: string; score: number; scoreReason: string; retained: boolean
  }> | null>(null)
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set())
  const [filterModalOpen, setFilterModalOpen] = useState(false)
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

  // ---- CSV parsing (même logique que campagnes) ----
  function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) return { headers: [], rows: [] }
    const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
    function parseLine(line: string): string[] {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === sep && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      result.push(current.trim())
      return result
    }
    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map((line) => {
      const values = parseLine(line)
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
      return obj
    })
    return { headers, rows }
  }

  function handleImportFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '')
      const { headers, rows } = parseCSV(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      // Auto-detect column mapping
      const findCol = (patterns: RegExp[]): string => {
        for (const p of patterns) {
          const found = headers.find((h) => p.test(h.toLowerCase()))
          if (found) return found
        }
        return ''
      }
      setCsvMapping({
        firstName: findCol([/^pr[éeè]nom/, /^first.?name/, /^given/]),
        lastName: findCol([/^nom$/, /^nom\b/, /^last.?name/, /^surname/]),
        email: findCol([/^e-?mail/, /^courriel/, /^mail/]),
        phone: findCol([/^t[éeè]l/, /^phone/, /^mobile/, /^portable/]),
        city: findCol([/^ville/, /^city/]),
        amount: findCol([/^montant/, /^amount/]),
        loanType: findCol([/^type.*pr[eêè]t/, /^loan.?type/, /^produit/]),
      })
    }
    reader.readAsText(file)
  }

  function getMappedLeads() {
    return csvRows
      .filter((row) => row[csvMapping.firstName]?.trim() || row[csvMapping.lastName]?.trim())
      .map((row) => ({
        firstName: csvMapping.firstName ? (row[csvMapping.firstName]?.trim() || 'Prénom') : 'Prénom',
        lastName: csvMapping.lastName ? (row[csvMapping.lastName]?.trim() || 'Nom') : 'Nom',
        email: csvMapping.email ? (row[csvMapping.email]?.trim() || '') : '',
        phone: csvMapping.phone ? (row[csvMapping.phone]?.trim() || '') : '',
        city: csvMapping.city ? (row[csvMapping.city]?.trim() || '') : '',
        amount: csvMapping.amount ? (row[csvMapping.amount]?.trim() || '') : '',
        loanType: csvMapping.loanType ? (row[csvMapping.loanType]?.trim() || '') : '',
      }))
  }

  async function handleImport() {
    const mapped = getMappedLeads()
    if (mapped.length === 0) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: mapped }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setImportResult(json.data)
      if (json.data.imported > 0) {
        // Recharger la liste des contacts
        fetchContacts()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  function resetImport() {
    setFileName('')
    setCsvHeaders([])
    setCsvRows([])
    setCsvMapping({})
    setImportResult(null)
    setCsvSortResults(null)
    setSelectedForImport(new Set())
  }

  async function handleSortCsv(instructions: string) {
    const mapped = getMappedLeads()
    if (mapped.length === 0 || !instructions.trim()) return
    setCsvSortLoading(true)
    setCsvSortResults(null)
    setSelectedForImport(new Set())
    setImportResult(null)
    try {
      const res = await fetch('/api/leads/sort-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: mapped, instructions: instructions.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setCsvSortResults(json.data.leads)
      // Auto-select les retained
      const retained = new Set<number>()
      json.data.leads.forEach((l: { index: number; retained: boolean }) => {
        if (l.retained) retained.add(l.index)
      })
      setSelectedForImport(retained)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du tri IA')
    } finally {
      setCsvSortLoading(false)
    }
  }

  function toggleCsvSelect(index: number) {
    setSelectedForImport((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function selectAllRetained() {
    if (!csvSortResults) return
    const retained = new Set<number>()
    csvSortResults.forEach((l) => { if (l.retained) retained.add(l.index) })
    setSelectedForImport(retained)
  }

  function deselectAll() {
    setSelectedForImport(new Set())
  }

  async function handleImportSelected() {
    if (!csvSortResults || selectedForImport.size === 0) return
    const toImport = csvSortResults.filter((l) => selectedForImport.has(l.index)).map((l) => ({
      firstName: l.firstName,
      lastName: l.lastName,
      email: l.email,
      phone: l.phone,
      city: l.city,
      amount: l.amount,
      loanType: l.loanType,
    }))
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: toImport }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setImportResult(json.data)
      if (json.data.imported > 0) fetchContacts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  const MAPPABLE_FIELDS = [
    { key: 'firstName', label: 'Prénom', required: true },
    { key: 'lastName', label: 'Nom', required: true },
    { key: 'email', label: 'Email', required: false },
    { key: 'phone', label: 'Téléphone', required: false },
    { key: 'city', label: 'Ville', required: false },
    { key: 'amount', label: 'Montant', required: false },
    { key: 'loanType', label: 'Type de prêt', required: false },
  ]

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

      {/* ===== FLUX UNIFIÉ : Import CSV + Tri IA ===== */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h3>Importer des prospects</h3>
          {fileName && <span className="link" onClick={resetImport}>Réinitialiser</span>}
        </div>
        <div className="panel-body" style={{ paddingTop: 16 }}>
          {!fileName ? (
            /* --- Étape 1 : Déposer le CSV --- */
            <label className="dropzone" style={{ marginBottom: 0, cursor: 'pointer' }}>
              <svg className="dz-ico" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
              <div className="dz-title">Déposez un fichier .csv</div>
              <div className="dz-sub">Colonnes attendues : prénom, nom, email, téléphone, ville, montant…</div>
              <input
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
              />
            </label>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Fichier sélectionné */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--slate)' }}>
                <Icon name="file-text" size={16} />
                <b>{fileName}</b>
                <span style={{ color: 'var(--slate-light)' }}>— {csvRows.length} ligne(s) détectée(s)</span>
              </div>

              {/* Mapping colonnes */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--slate)' }}>
                  1. Association des colonnes
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {MAPPABLE_FIELDS.map((field) => (
                    <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ width: 90, fontSize: 12, fontWeight: 500, flexShrink: 0, color: field.required ? 'var(--slate)' : 'var(--slate-light)' }}>
                        {field.label} {field.required && <span style={{ color: 'var(--red, #dc2626)' }}>*</span>}
                      </label>
                      <select
                        value={csvMapping[field.key] || ''}
                        onChange={(e) => { setCsvMapping((prev) => ({ ...prev, [field.key]: e.target.value })); setCsvSortResults(null); setSelectedForImport(new Set()) }}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--bg-card, #fff)', fontSize: 12 }}
                      >
                        <option value="">— Non mappé —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Étape 2 : Tri IA */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--slate)' }}>
                  2. Filtrer avec l&apos;IA <span style={{ fontWeight: 400, color: 'var(--slate-light)' }}>(optionnel)</span>
                </div>
                <p className="field-hint" style={{ marginBottom: 8 }}>
                  Décrivez les critères de filtrage. Ex : &quot;uniquement les montants supérieurs à 150 000 €&quot;, &quot;prêts immobiliers uniquement&quot;, &quot;écarter les demandes sans email&quot;.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    className="body-editor"
                    style={{ minHeight: 80, flex: 1 }}
                    placeholder="Conserver uniquement les prospects avec un montant supérieur à 150 000 € et un prêt immobilier..."
                    id="csv-tri-instructions"
                  />
                  <button
                    className="btn btn-primary"
                    style={{ flexShrink: 0, height: 'fit-content', padding: '8px 16px' }}
                    disabled={csvSortLoading || getMappedLeads().length === 0}
                    onClick={() => {
                      const el = document.getElementById('csv-tri-instructions') as HTMLTextAreaElement | null
                      const instructions = el?.value || ''
                      if (instructions.trim()) {
                        handleSortCsv(instructions)
                      } else {
                        // Sans instructions → importer tout directement
                        handleImport()
                      }
                    }}
                  >
                    {csvSortLoading ? 'Tri en cours…' : 'Filtrer'}
                  </button>
                </div>

                {/* Résultats du tri IA */}
                {csvSortResults && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>
                        {csvSortResults.filter((l) => l.retained).length} retenu(s) sur {csvSortResults.length}
                        <span style={{ fontWeight: 400, color: 'var(--slate-light)' }}> — sélection à importer</span>
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span className="link" style={{ fontSize: 11 }} onClick={selectAllRetained}>Sélectionner tous les retenus</span>
                        <span className="link" style={{ fontSize: 11 }} onClick={deselectAll}>Tout désélectionner</span>
                      </div>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--line-soft)' }}>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-soft, rgba(0,0,0,0.02))', position: 'sticky', top: 0, zIndex: 1 }}>
                            <th style={{ padding: '6px 8px', width: 30, textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedForImport.size === csvSortResults.length && csvSortResults.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedForImport(new Set(csvSortResults.map((l) => l.index)))
                                  } else {
                                    deselectAll()
                                  }
                                }}
                              />
                            </th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--slate)' }}>Prénom Nom</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--slate)' }}>Email</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>Montant</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--slate)' }}>Score</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--slate)' }}>Raison</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvSortResults.map((row) => {
                            const isSelected = selectedForImport.has(row.index)
                            const scoreColor = row.score >= 70 ? '#27ae60' : row.score >= 40 ? '#f39c12' : '#95a5a6'
                            const scoreBg = row.score >= 70 ? 'rgba(46,204,113,0.12)' : row.score >= 40 ? 'rgba(241,196,15,0.12)' : 'rgba(149,165,166,0.12)'
                            return (
                              <tr key={row.index} style={{
                                borderTop: '1px solid var(--line-soft)',
                                opacity: row.retained ? 1 : 0.5,
                                background: isSelected ? 'rgba(52,152,219,0.04)' : 'transparent',
                              }}>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleCsvSelect(row.index)}
                                  />
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                  <b>{row.firstName} {row.lastName}</b>
                                  {row.city && <div style={{ fontSize: 10, color: 'var(--slate-light)' }}>{row.city}</div>}
                                </td>
                                <td style={{ padding: '6px 8px', color: row.email ? 'var(--slate)' : 'var(--slate-light)' }}>
                                  {row.email || '—'}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                  {row.amount > 0 ? `${row.amount.toLocaleString('fr-FR')} €` : '—'}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <span style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                    fontSize: 11, fontWeight: 700,
                                    background: scoreBg, color: scoreColor,
                                  }}>
                                    {row.score}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 8px', color: 'var(--slate-light)', fontSize: 10 }}>
                                  {row.scoreReason}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Étape 3 : Importer */}
              {!csvSortResults && (
                <button
                  className="btn btn-primary"
                  disabled={importing || getMappedLeads().length === 0}
                  onClick={handleImport}
                >
                  {importing ? 'Import en cours…' : `Importer les ${getMappedLeads().length} prospect(s) sans filtrage`}
                </button>
              )}
              {csvSortResults && (
                <button
                  className="btn btn-primary"
                  disabled={importing || selectedForImport.size === 0}
                  onClick={handleImportSelected}
                >
                  {importing ? 'Import en cours…' : `Importer ${selectedForImport.size} prospect(s) sélectionné(s)`}
                </button>
              )}

              {/* Résultat import */}
              {importResult && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, fontSize: 13,
                  background: importResult.imported > 0 ? 'rgba(46,204,113,0.08)' : 'rgba(241,196,15,0.08)',
                  color: importResult.imported > 0 ? '#27ae60' : '#f39c12',
                }}>
                  <b>{importResult.message}</b>
                  {importResult.duplicates > 0 && (
                    <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                      Les doublons (email déjà en base) ont été ignorés automatiquement.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
