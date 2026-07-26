'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'

// =============================================================================
// Types
// =============================================================================

type CampaignStatus = 'draft' | 'sending' | 'completed' | 'cancelled' | 'failed'

type RecipientSource = 'validated_today' | 'validated_week' | 'manual' | 'all_active' | 'import_file'

interface Template {
  id: string
  name: string
}

interface MailDomain {
  id: string
  domain: string
  fromEmail: string | null
}

interface SearchLead {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string
  city: string
  status: string
}

interface Recipient {
  email: string
  status: 'sent' | 'failed' | 'pending' | 'skipped'
  sentAt: string | null
}

interface Campaign {
  id: string
  name: string
  templateId: string
  templateName: string
  domainName: string | null
  status: CampaignStatus
  recipientSource: RecipientSource
  totalRecipients: number
  sentCount: number
  failedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

interface CampaignDetail extends Campaign {
  statusCounts: { pending: number; sent: number; failed: number; skipped: number }
  recentRecipients: Recipient[]
}

// =============================================================================
// Constantes
// =============================================================================

const SOURCE_LABELS: Record<RecipientSource, string> = {
  validated_today: 'Prospects validés aujourd\'hui',
  validated_week: 'Prospects validés cette semaine',
  all_active: 'Tous les prospects actifs',
  manual: 'Sélection manuelle',
  import_file: 'Importer un fichier (.csv)',
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; variant: string }> = {
  draft:     { label: 'Brouillon',      variant: 'cs-draft' },
  sending:   { label: 'Envoi en cours', variant: 'cs-sending' },
  completed: { label: 'Terminée',       variant: 'cs-completed' },
  cancelled: { label: 'Annulée',        variant: 'cs-cancelled' },
  failed:    { label: 'Échec',          variant: 'cs-failed' },
}

const RECIPIENT_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  sent:    { label: 'Envoyé',     cls: 'b-client' },
  failed:  { label: 'Échec',      cls: 'b-lost' },
  pending: { label: 'En attente', cls: 'b-wait' },
  skipped: { label: 'Ignoré',     cls: 'b-progress' },
}

const EMPTY_FORM = {
  name: '',
  templateId: '',
  domainId: '' as string,
  source: 'validated_today' as RecipientSource,
}

// =============================================================================
// Helpers
// =============================================================================

function progressPct(c: { sentCount: number; totalRecipients: number }): number {
  if (c.totalRecipients === 0) return 0
  return Math.min(100, Math.round((c.sentCount / c.totalRecipients) * 100))
}

function etaMinutes(c: Campaign): number | null {
  if (c.status !== 'sending') return null
  const remaining = c.totalRecipients - c.sentCount - c.failedCount
  if (remaining <= 0) return 0
  return remaining // ~1 min par email (intervalle moyen 60s)
}

function formatEta(min: number): string {
  if (min <= 0) return 'Bientôt terminé'
  if (min < 60) return `${min} min restantes`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} h ${m} restantes` : `${h} h restantes`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Map la réponse API → Campaign (aplatit template.name)
function mapCampaign(raw: any): Campaign {
  return {
    id: raw.id,
    name: raw.name,
    templateId: raw.templateId,
    templateName: raw.template?.name ?? 'Modèle supprimé',
    domainName: raw.domain?.domain ?? null,
    status: raw.status,
    recipientSource: raw.recipientSource,
    totalRecipients: raw.totalRecipients,
    sentCount: raw.sentCount,
    failedCount: raw.failedCount,
    createdAt: raw.createdAt,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
  }
}

// =============================================================================
// Composant principal
// =============================================================================

export default function Campaigns({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'history'>('campaigns')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [mailDomains, setMailDomains] = useState<MailDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [detailCampaign, setDetailCampaign] = useState<CampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null)
  const [newCampaign, setNewCampaign] = useState(EMPTY_FORM)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)

  // ---- Multi-step modal ----
  const [createStep, setCreateStep] = useState<1 | 2>(1)

  // ---- Manual selection ----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchLead[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedLeads, setSelectedLeads] = useState<Map<string, SearchLead>>(new Map())

  // ---- CSV import ----
  const [csvFileName, setCsvFileName] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvMapping, setCsvMapping] = useState({ email: '', firstName: '', lastName: '', phone: '' })
  const [csvDragging, setCsvDragging] = useState(false)

  const activeCampaigns = campaigns.filter((c) => c.status === 'draft' || c.status === 'sending')
  const historyCampaigns = campaigns.filter(
    (c) => c.status === 'completed' || c.status === 'cancelled' || c.status === 'failed',
  )

  // ---- Fetch campaigns ----
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns')
      const json = await res.json()
      if (json.data) {
        setCampaigns(json.data.map(mapCampaign))
      }
    } catch (e) {
      console.error('fetchCampaigns:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ---- Fetch templates ----
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates')
      const json = await res.json()
      if (json.data) {
        setTemplates(json.data.map((t: any) => ({ id: t.id, name: t.name })))
      }
    } catch (e) {
      console.error('fetchTemplates:', e)
    }
  }, [])

  // ---- Fetch domaines d'envoi (type mail) ----
  const fetchMailDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains')
      const json = await res.json()
      const all = json.data ?? json
      if (Array.isArray(all)) {
        setMailDomains(all.filter((d: any) => d.type === 'mail' && d.isActive))
      }
    } catch (e) {
      console.error('fetchMailDomains:', e)
    }
  }, [])

  // ---- Chargement initial ----
  useEffect(() => {
    fetchCampaigns()
    fetchTemplates()
    fetchMailDomains()
  }, [fetchCampaigns, fetchTemplates, fetchMailDomains])

  // ---- Polling quand une campagne est "sending" ----
  useEffect(() => {
    const hasSending = campaigns.some((c) => c.status === 'sending')
    if (!hasSending) return
    const interval = setInterval(() => {
      fetchCampaigns()
      // Refresh le détail si ouvert
      if (detailCampaign && detailCampaign.status === 'sending') {
        fetchDetail(detailCampaign.id)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [campaigns, detailCampaign, fetchCampaigns])

  // ---- Fetch détail ----
  async function fetchDetail(id: string) {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`)
      const json = await res.json()
      if (json.data) {
        const c = json.data
        setDetailCampaign({
          ...mapCampaign(c),
          statusCounts: c.statusCounts ?? { pending: 0, sent: 0, failed: 0, skipped: 0 },
          recentRecipients: (c.recentRecipients ?? []).map((r: any) => ({
            email: r.email,
            status: r.status,
            sentAt: r.sentAt,
          })),
        })
      }
    } catch (e) {
      console.error('fetchDetail:', e)
    } finally {
      setDetailLoading(false)
    }
  }

  // ---- Création ----
  async function handlePreview() {
    setPreviewLoading(true)
    setPreviewCount(null)
    try {
      const res = await fetch('/api/campaigns/recipients-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientSource: newCampaign.source }),
      })
      const json = await res.json()
      if (json.data) {
        setPreviewCount(json.data.count)
      }
    } catch (e) {
      console.error('handlePreview:', e)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleCreate() {
    if (!newCampaign.templateId) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        name: newCampaign.name || 'Campagne sans nom',
        templateId: newCampaign.templateId,
        domainId: newCampaign.domainId || null,
        recipientSource: newCampaign.source,
      }

      // Pour les sources automatiques, on garde l'ancien flow (le serveur sélectionne).
      // Pour manual, on envoie les destinataires sélectionnés.
      // Pour import_file, on envoie les destinataires parsés du CSV.
      if (newCampaign.source === 'manual' && selectedLeads.size > 0) {
        body.recipients = Array.from(selectedLeads.values())
          .filter((l) => l.email)
          .map((l) => ({
            email: l.email as string,
            firstName: l.firstName,
            lastName: l.lastName,
            phone: l.phone,
          }))
      } else if (newCampaign.source === 'import_file') {
        body.recipients = getMappedRecipients()
      }

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.data) {
        await fetchCampaigns()
        setShowCreateModal(false)
        setNewCampaign(EMPTY_FORM)
        setPreviewCount(null)
        setSelectedLeads(new Map())
        setCsvRows([])
        setCreateStep(1)
        setActiveTab('campaigns')
      } else if (json.error) {
        alert(json.error)
      }
    } catch (e) {
      console.error('handleCreate:', e)
    } finally {
      setCreating(false)
    }
  }

  function openCreate() {
    setNewCampaign({
      ...EMPTY_FORM,
      templateId: templates[0]?.id ?? '',
    })
    setPreviewCount(null)
    setCreateStep(1)
    setSelectedLeads(new Map())
    setSearchQuery('')
    setSearchResults([])
    setCsvFileName('')
    setCsvHeaders([])
    setCsvRows([])
    setCsvMapping({ email: '', firstName: '', lastName: '', phone: '' })
    setShowCreateModal(true)
  }

  // ---- Search leads (debounced) ----
  useEffect(() => {
    if (createStep !== 2 || newCampaign.source !== 'manual') return
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leads?search=${encodeURIComponent(searchQuery)}&limit=50`)
        const json = await res.json()
        setSearchResults((json.data ?? []).map((l: any) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          city: l.city,
          status: l.status,
        })))
      } catch (e) {
        console.error('searchLeads:', e)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, createStep, newCampaign.source])

  // ---- CSV parsing ----
  function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) return { headers: [], rows: [] }

    // Détecter le séparateur (virgule ou point-virgule)
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

  function handleCsvFile(file: File | undefined) {
    if (!file) return
    setCsvFileName(file.name)
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
        email: findCol([/^e-?mail/, /^courriel/, /^mail/]),
        firstName: findCol([/^pr[ée]nom/, /^first.?name/, /^given/]),
        lastName: findCol([/^nom$/, /^nom\b/, /^last.?name/, /^surname/]),
        phone: findCol([/^t[ée]l/, /^phone/, /^mobile/, /^portable/]),
      })
    }
    reader.readAsText(file)
  }

  // Get valid CSV recipients based on mapping
  function getMappedRecipients() {
    return csvRows
      .filter((row) => row[csvMapping.email]?.trim())
      .map((row) => ({
        email: row[csvMapping.email].trim(),
        firstName: csvMapping.firstName ? row[csvMapping.firstName]?.trim() || undefined : undefined,
        lastName: csvMapping.lastName ? row[csvMapping.lastName]?.trim() || undefined : undefined,
        phone: csvMapping.phone ? row[csvMapping.phone]?.trim() || undefined : undefined,
      }))
  }

  // ---- Toggle lead selection ----
  function toggleLead(lead: SearchLead) {
    setSelectedLeads((prev) => {
      const next = new Map(prev)
      if (next.has(lead.id)) next.delete(lead.id)
      else next.set(lead.id, lead)
      return next
    })
  }

  // ---- Actions campagne ----
  async function sendCampaign(id: string) {
    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      if (res.ok) {
        await fetchCampaigns()
      }
    } catch (e) {
      console.error('sendCampaign:', e)
    } finally {
      setSending(false)
    }
  }

  async function cancelCampaign(id: string) {
    try {
      const res = await fetch(`/api/campaigns/${id}/cancel`, { method: 'POST' })
      if (res.ok) {
        await fetchCampaigns()
      }
    } catch (e) {
      console.error('cancelCampaign:', e)
    }
  }

  // ---- Rendu barre de progression ----
  function ProgressBar({ c }: { c: { sentCount: number; totalRecipients: number } }) {
    const pct = progressPct(c)
    return (
      <div className="camp-progress">
        <div className="camp-progress-bar" style={{ width: `${pct}%` }} />
        <span className="camp-progress-label">
          {c.sentCount} / {c.totalRecipients}
        </span>
      </div>
    )
  }

  // ---- Badge de statut ----
  function StatusBadge({ status }: { status: CampaignStatus }) {
    const cfg = STATUS_CONFIG[status]
    return (
      <span className={`camp-status ${cfg.variant}`}>
        <span className="camp-status-dot" />
        {cfg.label}
      </span>
    )
  }

  return (
    <section className="view" id="campaigns">
      <style>{`
        .tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--line, #E2E8F0);
          margin-bottom: 22px;
        }
        .tab {
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 600;
          color: var(--slate);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: color .15s, border-color .15s;
          margin-bottom: -1px;
        }
        .tab:hover { color: var(--ink); }
        .tab.active {
          color: var(--blue-deep);
          border-bottom-color: var(--orange);
        }
        .camp-card {
          background: var(--white, #fff);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 14px;
          transition: box-shadow .15s, border-color .15s;
        }
        .camp-card:hover { box-shadow: 0 4px 14px rgba(15,41,66,0.06); border-color: var(--slate-light); }
        .camp-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }
        .camp-card-name { font-size: 15px; font-weight: 700; color: var(--ink); }
        .camp-card-meta { font-size: 12px; color: var(--slate); margin-top: 3px; }
        .camp-card-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
        .camp-progress {
          position: relative;
          height: 22px;
          background: var(--bg, #F1F5F9);
          border-radius: 6px;
          overflow: hidden;
          margin: 8px 0 10px;
        }
        .camp-progress-bar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          background: linear-gradient(90deg, var(--blue), var(--blue-dark));
          border-radius: 6px;
          transition: width .3s ease;
        }
        .camp-progress-label {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--ink);
        }
        .camp-card-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--slate);
        }
        .camp-source {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          background: var(--bg, #F1F5F9);
          border-radius: 5px;
          font-size: 11px;
          color: var(--slate);
        }
        .camp-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid transparent;
        }
        .camp-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .cs-draft     { background: #F1F5F9; color: var(--slate); border-color: #E2E8F0; }
        .cs-sending   { background: #E6F1FB; color: var(--blue-dark); border-color: #B5D4F4; }
        .cs-sending .camp-status-dot { animation: camp-pulse 1.4s ease-in-out infinite; }
        .cs-completed { background: var(--green-soft, #F0FDF4); color: var(--green); border-color: var(--green-border, #BBF7D0); }
        .cs-cancelled { background: var(--orange-soft, #FFF4E8); color: var(--orange-ink, #B45309); border-color: var(--orange-border, #FCD9B0); }
        .cs-failed    { background: var(--red-soft, #FEF2F2); color: var(--red); border-color: var(--red-border, #FBCACA); }
        @keyframes camp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .4; transform: scale(.7); }
        }
        .camp-empty {
          text-align: center;
          padding: 48px 20px;
          border: 1px dashed var(--border, #E2E8F0);
          border-radius: 12px;
          color: var(--slate);
        }
        .camp-empty-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px; height: 48px;
          border-radius: 50%;
          background: var(--bg, #F1F5F9);
          color: var(--slate-light);
          margin-bottom: 14px;
        }
        .camp-source-radio {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 8px;
          cursor: pointer;
          margin-bottom: 8px;
          transition: border-color .15s, background .15s;
        }
        .camp-source-radio:hover { border-color: var(--slate-light); }
        .camp-source-radio.active { border-color: var(--blue); background: #F5FAFE; }
        .camp-source-radio input { margin-top: 2px; accent-color: var(--blue); }
        .camp-source-radio-label { font-size: 13px; color: var(--ink); font-weight: 500; }
        .camp-manual-note {
          font-size: 12px;
          color: var(--orange-ink, #B45309);
          background: var(--orange-soft, #FFF4E8);
          border: 1px solid var(--orange-border, #FCD9B0);
          border-radius: 6px;
          padding: 8px 10px;
          margin-top: 8px;
        }
        .camp-preview-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg, #F1F5F9);
          border-radius: 8px;
          margin-top: 8px;
        }
        .camp-preview-count {
          font-size: 18px;
          font-weight: 700;
          color: var(--blue-deep);
        }
        .camp-detail-progress {
          display: flex;
          gap: 16px;
          margin: 14px 0;
          flex-wrap: wrap;
        }
        .camp-stat {
          flex: 1;
          min-width: 110px;
          background: var(--bg, #F1F5F9);
          border-radius: 8px;
          padding: 12px 14px;
        }
        .camp-stat-num { font-size: 20px; font-weight: 700; color: var(--ink); }
        .camp-stat-lbl { font-size: 11px; color: var(--slate); margin-top: 2px; }
        .camp-recip-tbl {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        .camp-recip-tbl th {
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          color: var(--slate);
          text-transform: uppercase;
          letter-spacing: .04em;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border, #E2E8F0);
        }
        .camp-recip-tbl td {
          padding: 9px 10px;
          font-size: 13px;
          color: var(--ink);
          border-bottom: 1px solid var(--border, #E2E8F0);
        }
        .camp-history-row { cursor: pointer; transition: background .12s; }
        .camp-history-row:hover { background: var(--bg, #F1F5F9); }
        .camp-loading { text-align: center; padding: 40px; color: var(--slate); font-size: 14px; }
      `}</style>

      <div className="tabs">
        <button
          className={`tab${activeTab === 'campaigns' ? ' active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
        >
          Campagnes
        </button>
        <button
          className={`tab${activeTab === 'history' ? ' active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Historique
        </button>
      </div>

      {/* ===================== TAB : CAMPAGNES ===================== */}
      {activeTab === 'campaigns' && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <h3>
              Campagnes
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--slate)', marginLeft: 8 }}>
                {activeCampaigns.length} active{activeCampaigns.length > 1 ? 's' : ''}
              </span>
            </h3>
            <button className="btn btn-primary" onClick={openCreate}>+ Nouvelle campagne</button>
          </div>
          <div className="panel-body" style={{ paddingTop: 16 }}>
            <p className="field-hint" style={{ marginBottom: 16 }}>
              Créez une campagne pour envoyer un même modèle d&apos;email à un groupe de prospects,
              avec espacement anti-spam entre chaque envoi.
            </p>

            {loading ? (
              <div className="camp-loading">Chargement…</div>
            ) : activeCampaigns.length === 0 ? (
              <div className="camp-empty">
                <div className="camp-empty-icon">
                  <Icon name="mail" size={22} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                  Aucune campagne
                </div>
                <div style={{ fontSize: 13 }}>Créez votre première campagne.</div>
              </div>
            ) : (
              activeCampaigns.map((c) => (
                <div className="camp-card" key={c.id}>
                  <div className="camp-card-top">
                    <div>
                      <div className="camp-card-name">{c.name}</div>
                      <div className="camp-card-meta">
                        {c.templateName} · créée le {formatDate(c.createdAt)}
                      </div>
                    </div>
                    <div className="camp-card-actions">
                      <StatusBadge status={c.status} />
                    </div>
                  </div>

                  {c.status === 'sending' && <ProgressBar c={c} />}

                  <div className="camp-card-foot">
                    <span className="camp-source">
                      {SOURCE_LABELS[c.recipientSource] ?? c.recipientSource}
                    </span>
                    <div className="camp-card-actions">
                      {c.status === 'draft' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => sendCampaign(c.id)}
                          disabled={sending}
                        >
                          Envoyer
                        </button>
                      )}
                      {c.status === 'sending' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--red)' }}
                          onClick={() => setCancelTarget(c)}
                        >
                          Annuler
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => fetchDetail(c.id)}
                      >
                        Voir détails
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB : HISTORIQUE ===================== */}
      {activeTab === 'history' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Historique des campagnes</h3>
          </div>
          <div className="panel-body">
            {loading ? (
              <div className="camp-loading">Chargement…</div>
            ) : historyCampaigns.length === 0 ? (
              <div className="camp-empty">
                <div className="camp-empty-icon">
                  <Icon name="check-circle" size={22} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                  Aucun historique
                </div>
                <div style={{ fontSize: 13 }}>
                  Les campagnes terminées, annulées ou échouées apparaîtront ici.
                </div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Modèle</th>
                    <th>Statut</th>
                    <th>Envoyés / Échecs / Total</th>
                    <th>Débutée</th>
                    <th>Terminée</th>
                  </tr>
                </thead>
                <tbody>
                  {historyCampaigns.map((c) => (
                    <tr
                      key={c.id}
                      className="camp-history-row"
                      onClick={() => fetchDetail(c.id)}
                    >
                      <td><b>{c.name}</b></td>
                      <td>{c.templateName}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        {c.sentCount} / {c.failedCount} / {c.totalRecipients}
                      </td>
                      <td>{formatDateTime(c.startedAt)}</td>
                      <td>{formatDateTime(c.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===================== MODALE : NOUVELLE CAMPAGNE (multi-step) ===================== */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateStep(1) }}
        title={createStep === 1 ? 'Nouvelle campagne' : newCampaign.source === 'manual' ? 'Sélection des prospects' : 'Import du fichier'}
        wide={createStep === 2}
      >
        <style>{`
          .nc-field { display: flex; flex-direction: column; gap: 6px; }
          .nc-label {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.05em; color: #64748b;
          }
          .nc-input {
            padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 10px;
            font-size: 14px; color: #1e293b; background: #fff; width: 100%;
            outline: none; transition: border-color 0.15s, box-shadow 0.15s;
            font-family: inherit; box-sizing: border-box;
          }
          .nc-input:focus { border-color: #2B8BDE; box-shadow: 0 0 0 3px rgba(43,139,222,0.1); }
          .nc-input::placeholder { color: #cbd5e1; }
          .nc-source {
            display: flex; align-items: flex-start; gap: 12px;
            padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 10px;
            cursor: pointer; transition: all 0.15s; background: #fff;
          }
          .nc-source:hover { border-color: #cbd5e1; background: #fafbfc; }
          .nc-source.active {
            border-color: #2B8BDE; background: rgba(43,139,222,0.03);
            box-shadow: 0 0 0 1px #2B8BDE;
          }
          .nc-source input { margin-top: 3px; accent-color: #2B8BDE; cursor: pointer; }
          .nc-source-title { font-size: 14px; font-weight: 600; color: #1e293b; }
          .nc-source-icon {
            width: 34px; height: 34px; border-radius: 9px;
            background: #f1f5f9; display: grid; place-items: center;
            flex-shrink: 0; transition: all 0.15s;
          }
          .nc-source.active .nc-source-icon {
            background: rgba(43,139,222,0.1); color: #2B8BDE;
          }
          .nc-step-bar {
            display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
          }
          .nc-step-dot {
            width: 28px; height: 28px; border-radius: 50%; font-size: 12px; font-weight: 700;
            display: grid; place-items: center; transition: all 0.2s;
          }
          .nc-step-dot.on { background: #2B8BDE; color: #fff; }
          .nc-step-dot.off { background: #e2e8f0; color: #94a3b8; }
          .nc-step-line { flex: 1; height: 2px; background: #e2e8f0; border-radius: 1px; }
          .nc-search-box { position: relative; margin-bottom: 12px; }
          .nc-search-input {
            width: 100%; padding: 10px 14px 10px 38px; border: 1px solid #e2e8f0;
            border-radius: 10px; font-size: 14px; outline: none; box-sizing: border-box;
            font-family: inherit; transition: border-color 0.15s;
          }
          .nc-search-input:focus { border-color: #2B8BDE; }
          .nc-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
          .nc-lead-row {
            display: flex; align-items: center; gap: 10px; padding: 10px 12px;
            border: 1px solid #e5e7eb; border-radius: 9px; margin-bottom: 6px;
            cursor: pointer; transition: all 0.12s; background: #fff;
          }
          .nc-lead-row:hover { border-color: #cbd5e1; background: #fafbfc; }
          .nc-lead-row.selected { border-color: #2B8BDE; background: rgba(43,139,222,0.03); }
          .nc-lead-row input { accent-color: #2B8BDE; }
          .nc-lead-name { font-size: 13px; font-weight: 600; color: #1e293b; }
          .nc-lead-email { font-size: 11px; color: #64748b; }
          .nc-lead-city { font-size: 10px; color: #94a3b8; margin-left: auto; }
          .nc-csv-dropzone {
            border: 2px dashed #cbd5e1; border-radius: 12px; padding: 32px 20px;
            text-align: center; cursor: pointer; transition: all 0.15s; background: #fafbfc;
          }
          .nc-csv-dropzone:hover, .nc-csv-dropzone.drag { border-color: #2B8BDE; background: rgba(43,139,222,0.03); }
          .nc-map-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
          .nc-map-label { font-size: 12px; font-weight: 600; color: #64748b; min-width: 80px; }
          .nc-map-select {
            flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
            font-size: 13px; outline: none; cursor: pointer; font-family: inherit;
          }
          .nc-map-select:focus { border-color: #2B8BDE; }
          .nc-preview-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
          .nc-preview-table th { text-align: left; padding: 6px 10px; background: #f1f5f9; font-weight: 600; color: #64748b; border-radius: 6px 6px 0 0; }
          .nc-preview-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
          .nc-preview-wrap { max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
        `}</style>

        {/* ============ STEP 1 : Configuration ============ */}
        {createStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header contextuel */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              background: 'rgba(43,139,222,0.04)', border: '1px solid rgba(43,139,222,0.1)',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(43,139,222,0.15), rgba(43,139,222,0.05))',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon name="mail" size={20} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Nouvelle campagne</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Envoi espacé anti-spam · 200/jour max · 30–90 s entre emails
                </div>
              </div>
            </div>

            {/* Nom */}
            <div className="nc-field">
              <label className="nc-label">Nom de la campagne</label>
              <input
                type="text"
                className="nc-input"
                placeholder="Ex : Offre spéciale rentrée"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              />
            </div>

            {/* Modèle */}
            <div className="nc-field">
              <label className="nc-label">Modèle d'email</label>
              <select
                className="nc-input"
                value={newCampaign.templateId}
                onChange={(e) => setNewCampaign({ ...newCampaign, templateId: e.target.value })}
                style={{ cursor: 'pointer' }}
              >
                <option value="" disabled>Sélectionnez un modèle…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Domaine d'envoi */}
            <div className="nc-field">
              <label className="nc-label">Domaine d'envoi</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <select
                  className="nc-input"
                  value={newCampaign.domainId}
                  onChange={(e) => setNewCampaign({ ...newCampaign, domainId: e.target.value })}
                  style={{ cursor: 'pointer', flex: 1 }}
                >
                  <option value="">Adresse globale (from_email)</option>
                  {mailDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domain}{d.fromEmail ? ` — ${d.fromEmail}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, padding: '8px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() => {
                    setShowCreateModal(false)
                    if (onNavigate) onNavigate('domains')
                  }}
                  title="Configurer un nouveau domaine d'envoi"
                >
                  + Nouveau
                </button>
              </div>
              <small style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                Sélectionnez le domaine qui apparaîtra comme expéditeur. Si vide, l'adresse globale configurée dans les paramètres est utilisée.
              </small>
            </div>

            {/* Destinataires */}
            <div className="nc-field">
              <label className="nc-label">Destinataires</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(Object.keys(SOURCE_LABELS) as RecipientSource[]).map((src) => (
                  <label
                    key={src}
                    className={`nc-source${newCampaign.source === src ? ' active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="source"
                      checked={newCampaign.source === src}
                      onChange={() => {
                        setNewCampaign({ ...newCampaign, source: src })
                        setPreviewCount(null)
                      }}
                    />
                    <div className="nc-source-icon">
                      <Icon name={
                        src === 'validated_today' ? 'check-circle' :
                        src === 'validated_week' ? 'calendar' :
                        src === 'all_active' ? 'users' :
                        src === 'import_file' ? 'download' : 'user-plus'
                      } size={18} />
                    </div>
                    <div>
                      <div className="nc-source-title">{SOURCE_LABELS[src]}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Note manual/import */}
              {(newCampaign.source === 'manual' || newCampaign.source === 'import_file') && (
                <div style={{
                  fontSize: 12, color: '#1E6FB8', fontWeight: 500,
                  background: 'rgba(43,139,222,0.06)', border: '1px solid rgba(43,139,222,0.15)',
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  {newCampaign.source === 'manual'
                    ? 'Vous sélectionnerez les prospects à l\'étape suivante.'
                    : 'Vous importerez votre fichier CSV à l\'étape suivante. Les prospects importés ne se mélangent pas avec la base existante.'}
                </div>
              )}

              {/* Preview count (sources automatiques uniquement) */}
              {newCampaign.source !== 'manual' && newCampaign.source !== 'import_file' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #e5e7eb',
                }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handlePreview}
                    disabled={previewLoading}
                    style={{ fontWeight: 600 }}
                  >
                    {previewLoading ? 'Calcul…' : 'Prévisualiser'}
                  </button>
                  {previewCount === null ? (
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>? destinataires</span>
                  ) : (
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#1E6FB8' }}>
                      {previewCount}
                      <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b', marginLeft: 4 }}>
                        destinataire{previewCount > 1 ? 's' : ''}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
              paddingTop: 16, borderTop: '1px solid #f1f5f9',
            }}>
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                Annuler
              </button>
              {newCampaign.source === 'manual' || newCampaign.source === 'import_file' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setCreateStep(2)}
                  disabled={!newCampaign.name.trim() || !newCampaign.templateId}
                  style={{ padding: '10px 24px', borderRadius: 10, fontWeight: 700 }}
                >
                  Continuer →
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={!newCampaign.name.trim() || !newCampaign.templateId || previewCount === null || creating}
                  style={{ padding: '10px 24px', borderRadius: 10, fontWeight: 700 }}
                >
                  {creating ? 'Création…' : 'Créer la campagne'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ============ STEP 2a : Sélection manuelle ============ */}
        {createStep === 2 && newCampaign.source === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Step indicator */}
            <div className="nc-step-bar">
              <div className="nc-step-dot on">1</div>
              <div className="nc-step-line" />
              <div className="nc-step-dot on">2</div>
            </div>

            {/* Selected count */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              background: 'rgba(43,139,222,0.04)', border: '1px solid rgba(43,139,222,0.1)',
            }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Prospects sélectionnés</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#1E6FB8' }}>
                {selectedLeads.size}
              </span>
            </div>

            {/* Search */}
            <div className="nc-search-box">
              <span className="nc-search-icon"><Icon name="search" size={18} /></span>
              <input
                className="nc-search-input"
                placeholder="Rechercher par nom, email, téléphone, ville…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* Results */}
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {searchLoading && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>Recherche…</div>}
              {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                  Aucun prospect trouvé. Les prospects sans email ne peuvent pas être sélectionnés.
                </div>
              )}
              {!searchLoading && searchResults.map((lead) => {
                const isSelected = selectedLeads.has(lead.id)
                const hasEmail = !!lead.email
                return (
                  <label
                    key={lead.id}
                    className={`nc-lead-row${isSelected ? ' selected' : ''}`}
                    style={{ opacity: hasEmail ? 1 : 0.5, cursor: hasEmail ? 'pointer' : 'not-allowed' }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!hasEmail}
                      onChange={() => hasEmail && toggleLead(lead)}
                    />
                    <div>
                      <div className="nc-lead-name">{lead.firstName} {lead.lastName}</div>
                      <div className="nc-lead-email">{lead.email || 'Pas d\'email'}</div>
                    </div>
                    <span className="nc-lead-city">{lead.city}</span>
                  </label>
                )
              })}
              {!searchLoading && !searchQuery.trim() && (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                  Tapez pour rechercher des prospects.
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 16, borderTop: '1px solid #f1f5f9',
            }}>
              <button className="btn btn-ghost" onClick={() => setCreateStep(1)}>← Retour</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={selectedLeads.size === 0 || creating}
                style={{ padding: '10px 24px', borderRadius: 10, fontWeight: 700 }}
              >
                {creating ? 'Création…' : `Créer (${selectedLeads.size} destinataire${selectedLeads.size > 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 2b : Import CSV ============ */}
        {createStep === 2 && newCampaign.source === 'import_file' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Step indicator */}
            <div className="nc-step-bar">
              <div className="nc-step-dot on">1</div>
              <div className="nc-step-line" />
              <div className="nc-step-dot on">2</div>
            </div>

            <div style={{
              fontSize: 12, color: '#1E6FB8', fontWeight: 500,
              background: 'rgba(43,139,222,0.06)', border: '1px solid rgba(43,139,222,0.15)',
              borderRadius: 8, padding: '10px 12px',
            }}>
              Les prospects importés seront utilisés <b>uniquement</b> pour cette campagne.
              Ils ne se mélangent pas avec la base de prospects existante.
            </div>

            {/* Dropzone */}
            {csvRows.length === 0 ? (
              <div
                className={`nc-csv-dropzone${csvDragging ? ' drag' : ''}`}
                onClick={() => document.getElementById('csv-file-input')?.click()}
                onDragEnter={(e) => { e.preventDefault(); setCsvDragging(true) }}
                onDragOver={(e) => { e.preventDefault(); setCsvDragging(true) }}
                onDragLeave={() => setCsvDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setCsvDragging(false)
                  if (e.dataTransfer.files.length) handleCsvFile(e.dataTransfer.files[0])
                }}
              >
                <Icon name="download" size={32} style={{ color: '#94a3b8', marginBottom: 8 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>
                  Déposez votre fichier .csv ici
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  ou cliquez pour parcourir
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8 }}>
                  Colonnes attendues : email (obligatoire), prénom, nom, téléphone
                </div>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => handleCsvFile(e.target.files?.[0])}
                />
              </div>
            ) : (
              <>
                {/* File info */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0',
                }}>
                  <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                    ✓ {csvFileName} — {csvRows.length} lignes
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setCsvRows([]); setCsvFileName(''); setCsvHeaders([]) }}
                  >
                    Changer
                  </button>
                </div>

                {/* Column mapping */}
                <div>
                  <label className="nc-label" style={{ marginBottom: 8, display: 'block' }}>
                    Correspondance des colonnes
                  </label>
                  <div className="nc-map-row">
                    <span className="nc-map-label">Email *</span>
                    <select className="nc-map-select" value={csvMapping.email}
                      onChange={(e) => setCsvMapping({ ...csvMapping, email: e.target.value })}>
                      <option value="">— Sélectionner —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="nc-map-row">
                    <span className="nc-map-label">Prénom</span>
                    <select className="nc-map-select" value={csvMapping.firstName}
                      onChange={(e) => setCsvMapping({ ...csvMapping, firstName: e.target.value })}>
                      <option value="">— Aucune —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="nc-map-row">
                    <span className="nc-map-label">Nom</span>
                    <select className="nc-map-select" value={csvMapping.lastName}
                      onChange={(e) => setCsvMapping({ ...csvMapping, lastName: e.target.value })}>
                      <option value="">— Aucune —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="nc-map-row">
                    <span className="nc-map-label">Téléphone</span>
                    <select className="nc-map-select" value={csvMapping.phone}
                      onChange={(e) => setCsvMapping({ ...csvMapping, phone: e.target.value })}>
                      <option value="">— Aucune —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                {csvMapping.email && getMappedRecipients().length > 0 && (
                  <div>
                    <label className="nc-label" style={{ marginBottom: 8, display: 'block' }}>Aperçu</label>
                    <div className="nc-preview-wrap">
                      <table className="nc-preview-table">
                        <thead>
                          <tr>
                            <th>Email</th>
                            {csvMapping.firstName && <th>Prénom</th>}
                            {csvMapping.lastName && <th>Nom</th>}
                            {csvMapping.phone && <th>Tél</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {getMappedRecipients().slice(0, 10).map((r, i) => (
                            <tr key={i}>
                              <td>{r.email}</td>
                              {csvMapping.firstName && <td>{r.firstName || '—'}</td>}
                              {csvMapping.lastName && <td>{r.lastName || '—'}</td>}
                              {csvMapping.phone && <td>{r.phone || '—'}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {getMappedRecipients().length > 10 && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        + {getMappedRecipients().length - 10} autres lignes…
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 16, borderTop: '1px solid #f1f5f9',
            }}>
              <button className="btn btn-ghost" onClick={() => setCreateStep(1)}>← Retour</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!csvMapping.email || getMappedRecipients().length === 0 || creating}
                style={{ padding: '10px 24px', borderRadius: 10, fontWeight: 700 }}
              >
                {creating ? 'Création…' : `Créer (${getMappedRecipients().length} destinataire${getMappedRecipients().length > 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODALE : DÉTAILS CAMPAGNE ===================== */}
      <Modal
        isOpen={!!detailCampaign}
        onClose={() => setDetailCampaign(null)}
        title={detailCampaign?.name ?? ''}
      >
        {detailLoading ? (
          <div className="camp-loading">Chargement…</div>
        ) : detailCampaign ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              <StatusBadge status={detailCampaign.status} />
              <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                {detailCampaign.templateName} · {SOURCE_LABELS[detailCampaign.recipientSource] ?? detailCampaign.recipientSource}
              </span>
            </div>

            {(detailCampaign.status === 'sending' || detailCampaign.status === 'completed' || detailCampaign.status === 'failed') && (
              <ProgressBar c={detailCampaign} />
            )}

            <div className="camp-detail-progress">
              <div className="camp-stat">
                <div className="camp-stat-num">{detailCampaign.totalRecipients}</div>
                <div className="camp-stat-lbl">Total destinataires</div>
              </div>
              <div className="camp-stat">
                <div className="camp-stat-num" style={{ color: 'var(--green)' }}>{detailCampaign.sentCount}</div>
                <div className="camp-stat-lbl">Envoyés</div>
              </div>
              <div className="camp-stat">
                <div className="camp-stat-num" style={{ color: 'var(--red)' }}>{detailCampaign.failedCount}</div>
                <div className="camp-stat-lbl">Échecs</div>
              </div>
            </div>

            {(() => {
              const eta = etaMinutes(detailCampaign)
              if (eta === null) return null
              return (
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 10 }}>
                  ⏱ {formatEta(eta)}
                </div>
              )
            })()}

            {detailCampaign.recentRecipients.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', marginTop: 14, marginBottom: 4 }}>
                  Destinataires récents ({Math.min(20, detailCampaign.recentRecipients.length)})
                </div>
                <table className="camp-recip-tbl">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Statut</th>
                      <th>Heure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailCampaign.recentRecipients.slice(-20).reverse().map((r, i) => {
                      const cfg = RECIPIENT_STATUS_LABEL[r.status] ?? { label: r.status, cls: 'b-wait' }
                      return (
                        <tr key={i}>
                          <td>{r.email}</td>
                          <td>
                            <span className={`badge ${cfg.cls}`}>
                              <span className="badge-dot" />
                              {cfg.label}
                            </span>
                          </td>
                          <td>{formatDateTime(r.sentAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setDetailCampaign(null)}>
                Fermer
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      {/* ===================== CONFIRMATION ANNULATION ===================== */}
      <ConfirmDialog
        isOpen={!!cancelTarget}
        variant="warning"
        title="Annuler la campagne"
        message={<>Voulez-vous vraiment annuler la campagne <strong>{cancelTarget?.name}</strong> ? Les envois déjà planifiés seront interrompus. Les emails déjà envoyés ne seront pas rappelés.</>}
        confirmLabel="Annuler la campagne"
        onConfirm={() => {
          if (cancelTarget) cancelCampaign(cancelTarget.id)
        }}
        onClose={() => setCancelTarget(null)}
      />
    </section>
  )
}
