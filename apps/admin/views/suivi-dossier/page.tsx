'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Vue "Suivi dossier" (s44) — Système de suivi public (page /suivi côté client).
// =============================================================================
// INDÉPENDANT du pipeline email (PipelineStep). Aucune envoi d'email.
//
// 2 onglets :
//   1. "Configuration" (super-admin only) : CRUD des TrackingStep (étapes
//      configurables affichées côté client sur la page /suivi).
//   2. "Suivi des dossiers" (tous) : liste des leads + timeline tracking par
//      lead + boutons "Valider" / "Dévalider" (Q7 + Q9-A).
// =============================================================================

interface TrackingStep {
  id: string
  order: number
  name: string
  description: string | null
  icon: string | null
  isActive: boolean
  createdAt: string
}

interface Lead {
  id: string
  reference: string | null
  firstName: string
  lastName: string
  status: string
  assignedToId: string | null
}

interface LeadTrackingItem {
  id: string
  leadId: string
  trackingStepId: string
  validatedById: string | null
  validatedAt: string
  note: string | null
  validatedBy: { id: string; firstName: string; lastName: string } | null
}

// ----- Formulaire création/édition d'étape -----
interface StepFormState {
  name: string
  description: string
  icon: string
  isActive: boolean
}

const EMPTY_STEP_FORM: StepFormState = {
  name: '', description: '', icon: '', isActive: true,
}

export default function SuiviDossierView() {
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<'config' | 'tracking'>(isSuperAdmin ? 'config' : 'tracking')

  // ----- State global -----
  const [steps, setSteps] = useState<TrackingStep[]>([])
  const [loadingSteps, setLoadingSteps] = useState(true)

  const loadSteps = useCallback(async () => {
    setLoadingSteps(true)
    try {
      const r = await fetch('/api/tracking-steps', { cache: 'no-store' })
      if (r.ok) {
        const json = await r.json()
        setSteps(json.data ?? [])
      }
    } catch (e) {
      console.error('loadSteps:', e)
    } finally {
      setLoadingSteps(false)
    }
  }, [])

  useEffect(() => {
    loadSteps()
  }, [loadSteps])

  // Si l'utilisateur n'est pas super-admin, force l'onglet tracking
  useEffect(() => {
    if (!isSuperAdmin && activeTab === 'config') setActiveTab('tracking')
  }, [isSuperAdmin, activeTab])

  return (
    <section className="view" id="suivi-dossier">
      <header className="view-head">
        <div>
          <h1 className="view-title">Suivi dossier</h1>
          <p className="view-sub">
            Système de suivi public — les étapes validées ici sont visibles par le client sur la page /suivi
            (avec sa référence <code>KREDIX-XXXXXXXX</code>). Aucun envoi d&apos;email.
          </p>
        </div>
      </header>

      <div className="sd-tabs" role="tablist">
        {isSuperAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'config'}
            className={`sd-tab${activeTab === 'config' ? ' active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration des étapes
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tracking'}
          className={`sd-tab${activeTab === 'tracking' ? ' active' : ''}`}
          onClick={() => setActiveTab('tracking')}
        >
          Suivi des dossiers
        </button>
      </div>

      {activeTab === 'config' && isSuperAdmin && (
        <ConfigTab steps={steps} loading={loadingSteps} reload={loadSteps} />
      )}
      {activeTab === 'tracking' && (
        <TrackingTab steps={steps} loadingSteps={loadingSteps} reloadSteps={loadSteps} />
      )}

      <style>{`
        .sd-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line-soft, #e5e7eb); margin-bottom: 24px; }
        .sd-tab { background: none; border: none; padding: 12px 18px; font-size: 14px; font-weight: 600;
                  color: var(--text-muted, #6b7280); cursor: pointer; border-bottom: 2px solid transparent;
                  transition: color .15s, border-color .15s; }
        .sd-tab:hover { color: var(--text, #111827); }
        .sd-tab.active { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); }
        .sd-card { background: var(--paper, #fff); border: 1px solid var(--line-soft, #e5e7eb);
                   border-radius: 12px; padding: 18px; margin-bottom: 12px; }
        .sd-step-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px;
                       border: 1px solid var(--line-soft, #e5e7eb); border-radius: 10px; margin-bottom: 8px; background: var(--paper, #fff); }
        .sd-step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--primary-soft, #eff6ff);
                       color: var(--primary, #2563eb); display: flex; align-items: center; justify-content: center;
                       font-weight: 700; font-size: 13px; flex-shrink: 0; }
        .sd-step-info { flex: 1; }
        .sd-step-name { font-weight: 600; font-size: 14px; color: var(--text, #111827); }
        .sd-step-desc { font-size: 13px; color: var(--text-muted, #6b7280); margin-top: 2px; }
        .sd-btn-group { display: flex; gap: 4px; }
        .sd-icon-btn { background: none; border: 1px solid var(--line-soft, #e5e7eb); border-radius: 6px;
                       padding: 6px 8px; cursor: pointer; color: var(--text-muted, #6b7280); font-size: 13px; }
        .sd-icon-btn:hover { background: var(--bg-soft, #f9fafb); color: var(--text, #111827); }
        .sd-icon-btn.danger:hover { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
        .sd-lead-row { display: flex; align-items: center; gap: 14px; padding: 12px 16px;
                       border: 1px solid var(--line-soft, #e5e7eb); border-radius: 10px; margin-bottom: 6px;
                       background: var(--paper, #fff); cursor: pointer; transition: border-color .15s; }
        .sd-lead-row:hover { border-color: var(--primary, #2563eb); }
        .sd-ref { font-family: monospace; font-size: 12px; background: var(--bg-soft, #f3f4f6);
                  padding: 3px 8px; border-radius: 6px; color: var(--text, #111827); }
        .sd-timeline { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
        .sd-tl-row { display: flex; gap: 14px; align-items: flex-start; padding: 14px;
                     border-radius: 10px; border: 1px solid var(--line-soft, #e5e7eb); background: var(--paper, #fff); }
        .sd-tl-row.done { background: #f0fdf4; border-color: #bbf7d0; }
        .sd-tl-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                     font-weight: 700; font-size: 12px; flex-shrink: 0; background: var(--bg-soft, #f3f4f6); color: var(--text-muted, #6b7280); }
        .sd-tl-row.done .sd-tl-num { background: #dcfce7; color: #15803d; }
        .sd-tl-content { flex: 1; }
        .sd-tl-name { font-weight: 600; font-size: 14px; }
        .sd-tl-meta { font-size: 12px; color: var(--text-muted, #6b7280); margin-top: 4px; }
        .sd-tl-actions { display: flex; gap: 6px; }
      `}</style>
    </section>
  )
}

// =============================================================================
// Onglet Configuration (super-admin only) — CRUD TrackingStep
// =============================================================================
function ConfigTab({ steps, loading, reload }: {
  steps: TrackingStep[]
  loading: boolean
  reload: () => Promise<void>
}) {
  const [editing, setEditing] = useState<TrackingStep | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<StepFormState>(EMPTY_STEP_FORM)
  const [deleteTarget, setDeleteTarget] = useState<TrackingStep | null>(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setForm(EMPTY_STEP_FORM)
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (s: TrackingStep) => {
    setForm({
      name: s.name,
      description: s.description ?? '',
      icon: s.icon ?? '',
      isActive: s.isActive,
    })
    setEditing(s)
    setCreating(true)
  }

  const closeModal = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_STEP_FORM)
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        isActive: form.isActive,
      }
      const r = editing
        ? await fetch(`/api/tracking-steps/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/tracking-steps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      if (r.ok) {
        closeModal()
        await reload()
      }
    } catch (e) {
      console.error('save:', e)
    } finally {
      setSaving(false)
    }
  }

  const removeStep = async () => {
    if (!deleteTarget) return
    try {
      const r = await fetch(`/api/tracking-steps/${deleteTarget.id}`, { method: 'DELETE' })
      if (r.ok) {
        setDeleteTarget(null)
        await reload()
      }
    } catch (e) {
      console.error('removeStep:', e)
    }
  }

  const reorder = async (id: string, direction: 'up' | 'down') => {
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
    const idx = sortedSteps.findIndex((s) => s.id === id)
    if (idx === -1) return
    const swapWith = direction === 'up' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= sortedSteps.length) return
    // Swap
    const reordered = [...sortedSteps]
    const tmp = reordered[idx]
    reordered[idx] = reordered[swapWith]
    reordered[swapWith] = tmp
    // Renumber 1..N
    const payload = reordered.map((s, i) => ({ id: s.id, order: i + 1 }))
    try {
      await fetch('/api/tracking-steps/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: payload }),
      })
      await reload()
    } catch (e) {
      console.error('reorder:', e)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0 }}>
          {steps.length} étape{steps.length !== 1 ? 's' : ''} — visible côté client sur la page /suivi
        </p>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Nouvelle étape
        </button>
      </div>

      {loading ? (
        <p>Chargement…</p>
      ) : steps.length === 0 ? (
        <div className="sd-card">
          <p style={{ margin: 0, color: 'var(--text-muted, #6b7280)' }}>
            Aucune étape configurée. Créez votre première étape pour permettre aux conseillers
            de valider l&apos;avancement des dossiers clients.
          </p>
        </div>
      ) : (
        steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s, i, arr) => (
            <div key={s.id} className="sd-step-row">
              <div className="sd-step-num">{s.order}</div>
              <div className="sd-step-info">
                <div className="sd-step-name">
                  {s.name}
                  {!s.isActive && <span style={{ marginLeft: 8, fontSize: 11, color: '#dc2626' }}>inactive</span>}
                </div>
                {s.description && <div className="sd-step-desc">{s.description}</div>}
                {s.icon && <div className="sd-step-desc" style={{ fontStyle: 'italic' }}>icône : {s.icon}</div>}
              </div>
              <div className="sd-btn-group">
                <button className="sd-icon-btn" disabled={i === 0} onClick={() => reorder(s.id, 'up')}>↑</button>
                <button className="sd-icon-btn" disabled={i === arr.length - 1} onClick={() => reorder(s.id, 'down')}>↓</button>
                <button className="sd-icon-btn" onClick={() => openEdit(s)}>Éditer</button>
                <button className="sd-icon-btn danger" onClick={() => setDeleteTarget(s)}>Supprimer</button>
              </div>
            </div>
          ))
      )}

      <Modal
        open={creating}
        onClose={closeModal}
        title={editing ? `Éditer « ${editing.name} »` : 'Nouvelle étape de suivi'}
        primaryLabel={saving ? 'Enregistrement…' : 'Enregistrer'}
        onPrimary={save}
      >
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Nom de l&apos;étape *</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex : Dossier reçu"
            style={{ display: 'block', width: '100%', padding: '8px 10px', marginTop: 4,
                     border: '1px solid var(--line-soft, #e5e7eb)', borderRadius: 6, fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Description (affichée au client)</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ex : Nous avons bien reçu votre demande"
            rows={2}
            style={{ display: 'block', width: '100%', padding: '8px 10px', marginTop: 4,
                     border: '1px solid var(--line-soft, #e5e7eb)', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Icône lucide-react (optionnel)</span>
          <input
            type="text"
            value={form.icon}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
            placeholder="Ex : check-circle"
            style={{ display: 'block', width: '100%', padding: '8px 10px', marginTop: 4,
                     border: '1px solid var(--line-soft, #e5e7eb)', borderRadius: 6, fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span style={{ fontSize: 14 }}>Étape active (visible côté client)</span>
        </label>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer cette étape ?"
        message={
          <>
            Supprimer <strong>{deleteTarget?.name}</strong> ? Toutes les validations
            LeadTracking associées seront supprimées (cascade).
          </>
        }
        confirmLabel="Supprimer"
        onConfirm={removeStep}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// =============================================================================
// Onglet Suivi des dossiers (tous) — Liste leads + timeline tracking
// =============================================================================
function TrackingTab({ steps, loadingSteps }: {
  steps: TrackingStep[]
  loadingSteps: boolean
  reloadSteps: () => Promise<void>
}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [trackings, setTrackings] = useState<LeadTrackingItem[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ----- Liste des leads (avec scope automatique backend) -----
  const loadLeads = useCallback(async () => {
    setLoadingLeads(true)
    try {
      const r = await fetch('/api/leads?limit=200', { cache: 'no-store' })
      if (r.ok) {
        const json = await r.json()
        const list: Lead[] = (json.data?.leads ?? json.data ?? []).map((l: Lead) => ({
          id: l.id,
          reference: l.reference,
          firstName: l.firstName,
          lastName: l.lastName,
          status: l.status,
          assignedToId: l.assignedToId,
        }))
        setLeads(list)
      }
    } catch (e) {
      console.error('loadLeads:', e)
    } finally {
      setLoadingLeads(false)
    }
  }, [])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  // ----- Détail tracking d'un lead -----
  const openLead = async (lead: Lead) => {
    setSelectedLead(lead)
    setLoadingDetail(true)
    setTrackings([])
    try {
      const r = await fetch(`/api/leads/${lead.id}/tracking`, { cache: 'no-store' })
      if (r.ok) {
        const json = await r.json()
        setTrackings(json.data?.trackings ?? [])
      }
    } catch (e) {
      console.error('openLead:', e)
    } finally {
      setLoadingDetail(false)
    }
  }

  const validate = async (stepId: string) => {
    if (!selectedLead) return
    setActionLoading(stepId)
    try {
      const r = await fetch(`/api/leads/${selectedLead.id}/tracking/${stepId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (r.ok) {
        await openLead(selectedLead)  // refresh
      } else {
        const json = await r.json().catch(() => null)
        alert(json?.error ?? 'Erreur lors de la validation')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const unvalidate = async (stepId: string) => {
    if (!selectedLead) return
    setActionLoading(stepId)
    try {
      const r = await fetch(`/api/leads/${selectedLead.id}/tracking/${stepId}`, {
        method: 'DELETE',
      })
      if (r.ok) {
        await openLead(selectedLead)  // refresh
      } else {
        const json = await r.json().catch(() => null)
        alert(json?.error ?? 'Erreur lors de la dévalidation')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div>
      {loadingSteps || loadingLeads ? (
        <p>Chargement…</p>
      ) : steps.length === 0 ? (
        <div className="sd-card">
          <p style={{ margin: 0, color: 'var(--text-muted, #6b7280)' }}>
            Aucune étape de suivi configurée. Un administrateur doit d&apos;abord créer
            des étapes dans l&apos;onglet <em>Configuration</em>.
          </p>
        </div>
      ) : leads.length === 0 ? (
        <div className="sd-card">
          <p style={{ margin: 0, color: 'var(--text-muted, #6b7280)' }}>Aucun lead trouvé.</p>
        </div>
      ) : (
        leads.map((l) => (
          <div key={l.id} className="sd-lead-row" onClick={() => openLead(l)}>
            <span className="sd-ref">{l.reference ?? '—'}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {l.firstName} {l.lastName}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
              statut : {l.status}
            </span>
          </div>
        ))
      )}

      <Modal
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={
          selectedLead
            ? `Suivi — ${selectedLead.firstName} ${selectedLead.lastName} (${selectedLead.reference ?? '—'})`
            : ''
        }
        primaryLabel="Fermer"
        onPrimary={() => setSelectedLead(null)}
      >
        {loadingDetail ? (
          <p>Chargement de l&apos;avancement…</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', marginTop: 0 }}>
              Validez chaque étape au fur et à mesure du traitement du dossier.
              Le client verra l&apos;avancement en temps réel sur <code>kredix.fr/suivi</code>.
            </p>
            <div className="sd-timeline">
              {steps
                .filter((s) => s.isActive)
                .sort((a, b) => a.order - b.order)
                .map((s) => {
                  const tracking = trackings.find((t) => t.trackingStepId === s.id)
                  const done = !!tracking
                  return (
                    <div key={s.id} className={`sd-tl-row${done ? ' done' : ''}`}>
                      <div className="sd-tl-num">{done ? '✓' : s.order}</div>
                      <div className="sd-tl-content">
                        <div className="sd-tl-name">{s.name}</div>
                        {s.description && (
                          <div style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', marginTop: 2 }}>
                            {s.description}
                          </div>
                        )}
                        {done && tracking && (
                          <div className="sd-tl-meta">
                            Validé par {tracking.validatedBy?.firstName ?? '—'}{' '}
                            {tracking.validatedBy?.lastName ?? ''} le {formatDate(tracking.validatedAt)}
                          </div>
                        )}
                      </div>
                      <div className="sd-tl-actions">
                        {done ? (
                          <button
                            className="sd-icon-btn danger"
                            disabled={actionLoading === s.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              unvalidate(s.id)
                            }}
                          >
                            {actionLoading === s.id ? '…' : 'Dévalider'}
                          </button>
                        ) : (
                          <button
                            className="sd-icon-btn"
                            style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}
                            disabled={actionLoading === s.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              validate(s.id)
                            }}
                          >
                            {actionLoading === s.id ? '…' : 'Valider'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
