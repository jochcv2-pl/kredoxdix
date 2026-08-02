'use client'

import { useCallback, useEffect, useState } from 'react'
import { calculateLoan } from '@kredix/simulator'
import type { ApplicableRate } from '@kredix/types'
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
  fr: 'FR', be: 'BE', ch: 'CH', lu: 'LU', de: 'DE',
  es: 'ES', it: 'IT', pt: 'PT', nl: 'NL',
}
const SOURCE_LABELS_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_LABELS).map(([k, v]) => [v, k])
)

interface Contact {
  id: string
  firstName: string
  lastName: string
  initials: string
  email: string | null
  phone: string
  ville: string
  rue: string
  codePostal: string
  pays: string
  source: string
  recu: string          // date formatée pour affichage
  elapsedMin: number    // minutes écoulées depuis la soumission
  ackSent: boolean      // email de bienvenue envoyé ?
  relanceCount: number  // nombre de relances envoyées
  loanType: string
  amount: number | null
  monthlyPayment: number | null
  annualRate: number | null
  totalCost: number | null
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
  street: string | null
  zipCode: string | null
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
    rue: lead.street || '',
    codePostal: lead.zipCode || '',
    pays: SOURCE_LABELS[lead.country] ?? lead.country ?? '—',
    source: 'Formulaire site',
    recu: formatDateRecu(lead.createdAt),
    elapsedMin: calcElapsedMin(lead.createdAt),
    ackSent: !!lead.ackSentAt,
    relanceCount: lead.relanceCount ?? 0,
    loanType: LOAN_TYPE_LABELS[lead.loanType] ?? lead.loanType,
    amount: lead.amount,
    monthlyPayment: lead.monthlyPayment ?? null,
    annualRate: lead.annualRate ?? null,
    totalCost: lead.totalCost ?? null,
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

  // ----- Edition prospect -----
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editData, setEditData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    street: '', zipCode: '', city: '', country: 'FR',
    loanType: '', amount: '', durationYears: '',
    notes: '',
  })
  const [editSaving, setEditSaving] = useState(false)

  function openEditModal(id: string) {
    const c = contacts.find(x => x.id === id)
    if (!c) return
    setEditData({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email || '',
      phone: c.phone,
      street: c.rue || '',
      zipCode: c.codePostal || '',
      city: c.ville !== '—' ? c.ville : '',
      country: SOURCE_LABELS_REVERSE[c.pays] ?? 'FR',
      loanType: c.loanType || '',
      amount: c.amount ? String(c.amount) : '',
      durationYears: '',
      notes: '',
    })
    setEditTarget(id)
  }

  // ----- Parse-text : créer prospect depuis texte collé -----
  const [ptModalOpen, setPtModalOpen] = useState(false)
  const [ptRawText, setPtRawText] = useState('')
  const [ptParsing, setPtParsing] = useState(false)
  const [ptResult, setPtResult] = useState<{
    lead: {
      firstName: string; lastName: string; email: string; phone: string
      amount: number | null; submittedAt: string | null
      confidence: 'high' | 'medium' | 'low'; method: 'regex' | 'ai'
    }
    detectedFields: string[]; missingFields: string[]
  } | null>(null)
  const [ptLoanType, setPtLoanType] = useState('conso')
  const [ptDuration, setPtDuration] = useState(20)
  const [ptCreating, setPtCreating] = useState(false)
  const [ptCreated, setPtCreated] = useState(false)

  // Taux DB pour la simulation (fetch au chargement de la page)
  const [dbRates, setDbRates] = useState<ApplicableRate[]>([])
  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch('/api/rates?active=true')
      if (res.ok) {
        const json = await res.json()
        const rates: ApplicableRate[] = (json?.data ?? []).map((r: { bank?: { name: string }; loanType: string; amountMin: number; amountMax: number; annualRate: number }) => ({
          bankName: r.bank?.name,
          loanType: r.loanType,
          amountMin: r.amountMin,
          amountMax: r.amountMax,
          annualRate: r.annualRate,
        }))
        setDbRates(rates)
      }
    } catch { /* fallback sur taux indicatifs internes */ }
  }, [])

  // Charger les taux au mount
  useEffect(() => { fetchRates() }, [fetchRates])

  // Simulation mensualité via calculateLoan (DB rates avec fallback indicatif)
  const ptAmount = ptResult?.lead.amount || 1000
  const ptSimulation = calculateLoan(
    { loanType: ptLoanType as 'immo' | 'conso' | 'rachat' | 'pro', amount: ptAmount, durationYears: ptDuration },
    dbRates.length > 0 ? dbRates : undefined,
  )

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

  // ----- Edition prospect -----
  async function handleSaveEdit() {
    if (!editTarget) return
    setEditSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (editData.firstName) body.firstName = editData.firstName
      if (editData.lastName) body.lastName = editData.lastName
      body.email = editData.email || ''
      body.phone = editData.phone || '0000000000'
      body.street = editData.street || null
      body.zipCode = editData.zipCode || null
      body.city = editData.city || 'Inconnu'
      body.country = editData.country || 'FR'
      if (editData.loanType) body.loanType = editData.loanType
      if (editData.amount) body.amount = Number(editData.amount) || 0
      if (editData.durationYears) body.durationYears = Number(editData.durationYears) || 20
      if (editData.notes) body.notes = editData.notes

      const res = await fetch(`/api/leads/${editTarget}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      // Mise à jour optimiste locale
      setContacts((prev) => prev.map((c) => {
        if (c.id !== editTarget) return c
        return {
          ...c,
          firstName: editData.firstName || c.firstName,
          lastName: editData.lastName || c.lastName,
          email: editData.email || c.email,
          phone: editData.phone || c.phone,
          rue: editData.street || '',
          codePostal: editData.zipCode || '',
          ville: editData.city || c.ville,
          pays: SOURCE_LABELS[editData.country] ?? c.pays,
          loanType: LOAN_TYPE_LABELS[editData.loanType] ?? c.loanType,
          amount: body.amount as number || null,
        }
      }))
      setEditTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde')
    } finally {
      setEditSaving(false)
    }
  }

  // ----- Parse-text handlers -----
  function resetPtModal() {
    setPtRawText('')
    setPtParsing(false)
    setPtResult(null)
    setPtCreating(false)
    setPtCreated(false)
  }

  async function handleParseText() {
    if (!ptRawText.trim()) return
    setPtParsing(true)
    setPtResult(null)
    try {
      const res = await fetch('/api/leads/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ptRawText.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setPtResult(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur d\'extraction')
    } finally {
      setPtParsing(false)
    }
  }

  async function handleCreateFromParsed() {
    if (!ptResult) return
    setPtCreating(true)
    try {
      const lead = ptResult.lead
      // Construire les notes avec la date de soumission extraite
      let notes = ''
      if (lead.submittedAt) {
        const d = new Date(lead.submittedAt)
        const day = String(d.getUTCDate()).padStart(2, '0')
        const month = d.toLocaleString('fr-FR', { month: 'long', timeZone: 'UTC' })
        const year = d.getUTCFullYear()
        const h = String(d.getUTCHours()).padStart(2, '0')
        const m = String(d.getUTCMinutes()).padStart(2, '0')
        notes = `Formulaire soumis le ${day} ${month} ${year} à ${h}:${m}`
      }
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email || '',
          phone: lead.phone || '0000000000',
          city: 'Inconnu',
          loanType: ptLoanType,
          amount: lead.amount || 1000,
          durationYears: ptDuration,
          monthlyPayment: ptSimulation.monthlyPayment,
          annualRate: ptSimulation.annualRate,
          totalCost: ptSimulation.totalCost,
          notes: notes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      setPtCreated(true)
      fetchContacts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de création')
    } finally {
      setPtCreating(false)
    }
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { resetPtModal(); setPtModalOpen(true) }}>
              <Icon name="file-text" size={14} style={{ marginRight: 4 }} />
              Créer depuis texte
            </button>
            {fileName && <span className="link" onClick={resetImport}>Réinitialiser</span>}
          </div>
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
                  <th>Montant</th>
                  <th>Adresse</th>
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
                            <small>{c.email}</small>
                            {c.phone && <small style={{ color: 'var(--slate-light)' }}>{c.phone}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.amount && c.amount > 0
                          ? <span style={{ fontWeight: 500, fontSize: 12 }}>{c.amount.toLocaleString('fr-FR')} €{c.monthlyPayment ? <span style={{ fontSize: 11, color: 'var(--slate-light)', fontWeight: 400, marginLeft: 4 }}>({c.monthlyPayment.toLocaleString('fr-FR')} €/mois)</span> : ''}</span>
                          : <span style={{ color: 'var(--slate-light)', fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td>
                        <span style={{ fontSize: 12 }}>{c.rue ? `${c.rue}, ` : ''}{c.codePostal ? `${c.codePostal} ` : ''}{c.ville}{c.rue || c.codePostal ? '' : '—'}</span>
                      </td>
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
                            title="Modifier"
                            onClick={() => openEditModal(c.id)}
                            style={{ padding: '4px 8px' }}
                          >
                            <Icon name="pencil" size={14} />
                          </button>
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

      {/* ===== MODAL : Modifier un prospect ===== */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Modifier le prospect"
        wide
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="modal-fg">
            <label>Prénom *</label>
            <input
              type="text"
              value={editData.firstName}
              onChange={(e) => setEditData(d => ({ ...d, firstName: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Nom *</label>
            <input
              type="text"
              value={editData.lastName}
              onChange={(e) => setEditData(d => ({ ...d, lastName: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Adresse (rue)</label>
            <input
              type="text"
              placeholder="123 Rue de la Paix"
              value={editData.street}
              onChange={(e) => setEditData(d => ({ ...d, street: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Code postal</label>
            <input
              type="text"
              placeholder="75001"
              value={editData.zipCode}
              onChange={(e) => setEditData(d => ({ ...d, zipCode: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Ville *</label>
            <input
              type="text"
              value={editData.city}
              onChange={(e) => setEditData(d => ({ ...d, city: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Pays</label>
            <select
              value={editData.country}
              onChange={(e) => setEditData(d => ({ ...d, country: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--bg-card, #fff)', fontSize: 12, width: '100%' }}
            >
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="modal-fg">
            <label>Email</label>
            <input
              type="email"
              value={editData.email}
              onChange={(e) => setEditData(d => ({ ...d, email: e.target.value }))}
              placeholder="email@exemple.com"
            />
          </div>
          <div className="modal-fg">
            <label>Téléphone *</label>
            <input
              type="tel"
              value={editData.phone}
              onChange={(e) => setEditData(d => ({ ...d, phone: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Type de prêt</label>
            <select
              value={editData.loanType}
              onChange={(e) => setEditData(d => ({ ...d, loanType: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--bg-card, #fff)', fontSize: 12, width: '100%' }}
            >
              <option value="">— Aucun —</option>
              {Object.entries(LOAN_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="modal-fg">
            <label>Montant (€)</label>
            <input
              type="number"
              min={0}
              value={editData.amount}
              onChange={(e) => setEditData(d => ({ ...d, amount: e.target.value }))}
            />
          </div>
          <div className="modal-fg">
            <label>Durée (années)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={editData.durationYears}
              onChange={(e) => setEditData(d => ({ ...d, durationYears: e.target.value }))}
            />
          </div>
          <div className="modal-fg full">
            <label>Notes</label>
            <textarea
              className="body-editor"
              style={{ minHeight: 80 }}
              placeholder="Notes internes..."
              value={editData.notes}
              onChange={(e) => setEditData(d => ({ ...d, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: 16, justifyContent: 'flex-start', gap: 8 }}>
          <button className="btn btn-primary" disabled={editSaving} onClick={handleSaveEdit}>
            {editSaving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
          <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>
            Annuler
          </button>
        </div>
      </Modal>

      {/* ===== MODAL : Créer prospect depuis texte collé ===== */}
      <Modal
        isOpen={ptModalOpen}
        onClose={() => setPtModalOpen(false)}
        title="Créer un prospect depuis texte"
        wide
      >
        {ptCreated ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#10003;</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--slate)' }}>
              Prospect créé avec succès
            </div>
            <div style={{ fontSize: 13, color: 'var(--slate-light)', marginTop: 8 }}>
              <b>{ptResult?.lead.firstName} {ptResult?.lead.lastName}</b> — {ptLoanType} {ptAmount.toLocaleString('fr-FR')} € / {ptDuration} ans — {ptSimulation.monthlyPayment.toLocaleString('fr-FR')} €/mois
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              onClick={() => { setPtModalOpen(false); resetPtModal() }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Collez une notification de formulaire (email, WhatsApp, etc.) et l&apos;extraction se fera automatiquement par regex, avec fallback IA si nécessaire.
            </p>

            {/* Step 1: Textarea */}
            <div className="modal-fg">
              <label>Texte à analyser</label>
              <textarea
                className="body-editor"
                style={{ minHeight: 140, width: '100%' }}
                placeholder={'Envoyé le Samedi 1 août 2026 16:36.\nWie viel brauchen Sie?\n1000\nEmail\npaul@example.com\nFull name\nPaul Stolle\nPhone number\n+49 123 456 789'}
                value={ptRawText}
                onChange={(e) => { setPtRawText(e.target.value); setPtResult(null) }}
                disabled={ptParsing}
              />
            </div>

            <div className="modal-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={ptParsing || ptRawText.trim().length < 10}
                onClick={handleParseText}
              >
                {ptParsing ? 'Extraction en cours…' : 'Analyser'}
              </button>
              <button className="btn btn-ghost" onClick={() => setPtModalOpen(false)}>
                Annuler
              </button>
            </div>

            {/* Step 2: Preview des champs extraits */}
            {ptResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 8, fontSize: 12,
                  background: ptResult.lead.confidence === 'high'
                    ? 'rgba(46,204,113,0.08)'
                    : ptResult.lead.confidence === 'medium'
                      ? 'rgba(241,196,15,0.08)'
                      : 'rgba(241,196,15,0.08)',
                  color: ptResult.lead.confidence === 'high' ? '#27ae60' : '#f39c12',
                  marginBottom: 12,
                }}>
                  <b>
                    {ptResult.lead.confidence === 'high' ? '✓ Extraction fiable'
                      : ptResult.lead.confidence === 'medium' ? '⚠ Extraction partielle'
                        : '⚠ Extraction limitée'}
                  </b>
                  <span style={{ opacity: 0.7, marginLeft: 8 }}>
                    — via {ptResult.lead.method === 'regex' ? 'regex' : 'IA'}
                    {ptResult.detectedFields.length > 0 && (
                      <span> — {ptResult.detectedFields.length} champ(s) détecté(s)</span>
                    )}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <PtField label="Prénom" value={ptResult.lead.firstName} detected={ptResult.detectedFields.includes('firstName')} />
                  <PtField label="Nom" value={ptResult.lead.lastName} detected={ptResult.detectedFields.includes('lastName')} />
                  <PtField label="Email" value={ptResult.lead.email} detected={ptResult.detectedFields.includes('email')} />
                  <PtField label="Téléphone" value={ptResult.lead.phone} detected={ptResult.detectedFields.includes('phone')} />
                  <PtField label="Montant" value={ptResult.lead.amount ? `${ptResult.lead.amount.toLocaleString('fr-FR')} €` : '—'} detected={ptResult.detectedFields.includes('amount')} />
                  <PtField label="Date soumission" value={ptResult.lead.submittedAt
                    ? (() => {
                        // Afficher la date sans conversion timezone :
                        // le texte indique l'heure locale du prospect, pas UTC.
                        const d = new Date(ptResult.lead.submittedAt)
                        const day = String(d.getUTCDate()).padStart(2, '0')
                        const month = d.toLocaleString('fr-FR', { month: 'short', timeZone: 'UTC' })
                        const year = d.getUTCFullYear()
                        const h = String(d.getUTCHours()).padStart(2, '0')
                        const m = String(d.getUTCMinutes()).padStart(2, '0')
                        return `${day} ${month} ${year}, ${h}:${m}`
                      })()
                    : '—'
                  } detected={ptResult.detectedFields.includes('submittedAt')} />
                </div>

                {ptResult.missingFields.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--slate-light)' }}>
                    Champs non détectés : {ptResult.missingFields.map(f => FIELD_LABELS[f] || f).join(', ')}
                  </div>
                )}

                {/* Simulation : type de prêt + durée + mensualité */}
                <div style={{ marginTop: 20, padding: '14px', borderRadius: 8, background: 'var(--bg-soft, rgba(0,0,0,0.02))', border: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', marginBottom: 12 }}>Simulation de crédit</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div className="modal-fg" style={{ margin: 0 }}>
                      <label>Type de prêt</label>
                      <select
                        value={ptLoanType}
                        onChange={(e) => setPtLoanType(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--bg-card, #fff)', fontSize: 12, width: '100%' }}
                      >
                        <option value="immo">Immobilier</option>
                        <option value="conso">Consommation</option>
                        <option value="rachat">Rachat de crédit</option>
                        <option value="pro">Professionnel</option>
                      </select>
                    </div>
                    <div className="modal-fg" style={{ margin: 0 }}>
                      <label>Durée : {ptDuration} ans</label>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        value={ptDuration}
                        onChange={(e) => setPtDuration(parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: 'var(--primary, #2980b9)', marginTop: 4 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--slate-light)', marginTop: 2 }}>
                        <span>1 an</span>
                        <span>30 ans</span>
                      </div>
                    </div>
                    <div className="modal-fg" style={{ margin: 0 }}>
                      <label>Taux indicatif</label>
                      <div style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--bg-card, #fff)', fontSize: 12, color: 'var(--slate-light)' }}>
                        {ptSimulation.annualRate}%
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-card, #fff)', border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--slate-light)', marginBottom: 2 }}>Mensualité estimée</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary, #2980b9)' }}>
                        {ptSimulation.monthlyPayment.toLocaleString('fr-FR')} €
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--slate-light)' }}>Coût total</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--slate)' }}>
                        {ptSimulation.totalCost.toLocaleString('fr-FR')} €
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--slate-light)', marginTop: 2 }}>
                        {ptDuration * 12} mensualités
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: 16, justifyContent: 'flex-start', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    disabled={ptCreating || !ptResult.lead.firstName || !ptResult.lead.lastName}
                    onClick={handleCreateFromParsed}
                  >
                    {ptCreating ? 'Création en cours…' : 'Créer le prospect'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setPtResult(null); setPtRawText('') }}
                  >
                    Réessayer
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </section>
  )
}

// =============================================================================
// Sub-component : champ extrait dans le modal parse-text
// =============================================================================
const FIELD_LABELS: Record<string, string> = {
  firstName: 'Prénom',
  lastName: 'Nom',
  email: 'Email',
  phone: 'Téléphone',
  amount: 'Montant',
  submittedAt: 'Date soumission',
}

function PtField({ label, value, detected }: { label: string; value: string; detected: boolean }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 6, fontSize: 12,
      background: detected ? 'var(--bg-card, #fff)' : 'var(--bg-soft, rgba(0,0,0,0.02))',
      border: `1px solid ${detected ? 'var(--line-soft)' : 'var(--line-soft, transparent)'}`,
      opacity: detected ? 1 : 0.5,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--slate-light)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: detected ? 'var(--slate)' : 'var(--slate-light)', fontWeight: detected ? 500 : 400 }}>
        {value || <span style={{ fontStyle: 'italic' }}>non détecté</span>}
      </div>
    </div>
  )
}
