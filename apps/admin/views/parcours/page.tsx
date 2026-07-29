'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Mail, FileText,
  Check, X, Power, Save, AlertCircle,
} from 'lucide-react'

// =============================================================================
// ParcoursView — Configuration des étapes du parcours client.
// =============================================================================
// Remplace l'ancien système hardcoded de 7 niveaux.
// L'admin peut : ajouter, supprimer, réordonner, activer/désactiver, assigner
// un template email + un document PDF à chaque étape.
// 100% manuel : AUCUN envoi automatique. L'envoi se fait depuis la vue Clients.
// =============================================================================

interface PipelineStep {
  id: string
  order: number
  name: string
  description: string | null
  templateId: string | null
  documentId: string | null
  isActive: boolean
  template: { id: string; name: string; subject: string; language: string } | null
  document: { id: string; name: string; fileName: string } | null
}

interface EmailTemplateOption {
  id: string
  name: string
  subject: string
  language: string
  status: string
}

interface DocumentOption {
  id: string
  name: string
  fileName: string
}

export default function ParcoursView() {
  const [steps, setSteps] = useState<PipelineStep[]>([])
  const [templates, setTemplates] = useState<EmailTemplateOption[]>([])
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // Nouvelle étape (formulaire d'ajout).
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTemplateId, setNewTemplateId] = useState('')
  const [newDocumentId, setNewDocumentId] = useState('')
  const [adding, setAdding] = useState(false)

  // États d'édition inline.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<PipelineStep | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [stepsRes, tplRes, docRes] = await Promise.all([
        fetch('/api/pipeline-steps', { cache: 'no-store' }),
        fetch('/api/templates', { cache: 'no-store' }),
        fetch('/api/document-templates', { cache: 'no-store' }),
      ])

      if (!stepsRes.ok) throw new Error('Échec chargement étapes')
      const stepsJson = await stepsRes.json()
      setSteps(stepsJson.data || [])

      if (tplRes.ok) {
        const tplJson = await tplRes.json()
        setTemplates(tplJson.data || [])
      }
      if (docRes.ok) {
        const docJson = await docRes.json()
        setDocuments(docJson.data || [])
      }
      setError('')
    } catch (e) {
      console.error('loadAll:', e)
      setError('Impossible de charger les données du parcours')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // --- Actions ---

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/pipeline-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          templateId: newTemplateId || null,
          documentId: newDocumentId || null,
          isActive: true,
        }),
      })
      if (!res.ok) throw new Error('Échec création')
      await loadAll()
      setNewName('')
      setNewDesc('')
      setNewTemplateId('')
      setNewDocumentId('')
      setShowAddForm(false)
    } catch (e) {
      console.error('handleAdd:', e)
      setError("Impossible de créer l'étape")
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (step: PipelineStep) => {
    setEditingId(step.id)
    setEditDraft({ ...step })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  const handleSaveEdit = async () => {
    if (!editDraft) return
    setSavingId(editDraft.id)
    try {
      const res = await fetch(`/api/pipeline-steps/${editDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDraft.name,
          description: editDraft.description,
          templateId: editDraft.templateId,
          documentId: editDraft.documentId,
        }),
      })
      if (!res.ok) throw new Error('Échec sauvegarde')
      await loadAll()
      setEditingId(null)
      setEditDraft(null)
    } catch (e) {
      console.error('handleSaveEdit:', e)
      setError('Impossible de sauvegarder')
    } finally {
      setSavingId(null)
    }
  }

  const handleToggleActive = async (step: PipelineStep) => {
    try {
      const res = await fetch(`/api/pipeline-steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !step.isActive }),
      })
      if (!res.ok) throw new Error('Échec')
      setSteps(prev => prev.map(s => s.id === step.id ? { ...s, isActive: !s.isActive } : s))
    } catch (e) {
      console.error('handleToggleActive:', e)
    }
  }

  const handleDelete = async (step: PipelineStep) => {
    if (!confirm(`Supprimer l'étape "${step.name}" ?`)) return
    try {
      const res = await fetch(`/api/pipeline-steps/${step.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Échec suppression')
      await loadAll()
    } catch (e) {
      console.error('handleDelete:', e)
      setError('Impossible de supprimer')
    }
  }

  const handleMove = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= steps.length) return
    const reordered = [...steps]
    ;[reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]]
    const orderedIds = reordered.map(s => s.id)
    // Optimistic
    setSteps(prev => {
      const copy = [...prev]
      ;[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]]
      return copy.map((s, i) => ({ ...s, order: i + 1 }))
    })
    try {
      await fetch('/api/pipeline-steps/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
    } catch (e) {
      console.error('handleMove:', e)
      await loadAll()
    }
  }

  // --- Render ---

  if (loading) {
    return <div className="loading-state">Chargement du parcours…</div>
  }

  return (
    <section className="view" id="parcours">
      <style>{`
        .pcrs-head { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .pcrs-head h2 { font-size: 22px; font-weight: 700; color: var(--text); margin: 0 0 4px; }
        .pcrs-head p { margin: 0; color: var(--slate); font-size: 13px; max-width: 600px; }
        .pcrs-badge-manual {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 7px;
          background: rgba(34,197,94,0.1); color: #15803d; margin-left: 8px;
        }

        .pcrs-steps { display: flex; flex-direction: column; gap: 12px; max-width: 900px; }

        .pcrs-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
          overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .pcrs-card:hover { border-color: #cbd5e1; }
        .pcrs-card.inactive { opacity: 0.6; background: #f8fafc; }

        .pcrs-card-body { display: flex; align-items: stretch; }

        .pcrs-grip {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 0 8px; border-right: 1px solid #f1f5f9; color: #cbd5e1;
        }

        .pcrs-order-num {
          width: 36px; height: 36px; border-radius: 10px;
          display: grid; place-items: center; font-size: 16px; font-weight: 800;
          background: linear-gradient(135deg, #2B8BDE, #1E6FB8); color: #fff;
          margin-bottom: 4px;
        }

        .pcrs-move-btns { display: flex; flex-direction: column; gap: 2px; }
        .pcrs-move-btn {
          width: 22px; height: 18px; border: 1px solid #e5e7eb; background: #fff;
          border-radius: 4px; display: grid; place-items: center; cursor: pointer;
          color: #94a3b8; transition: all 0.15s;
        }
        .pcrs-move-btn:hover:not(:disabled) { background: #f1f5f9; color: #2B8BDE; border-color: #2B8BDE; }
        .pcrs-move-btn:disabled { opacity: 0.3; cursor: default; }

        .pcrs-info { flex: 1; padding: 16px 20px; }
        .pcrs-name { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
        .pcrs-desc { font-size: 12px; color: #94a3b8; }

        .pcrs-meta { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .pcrs-meta-item {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 6px;
        }
        .pcrs-meta-item.has-tpl { background: rgba(43,139,222,0.08); color: #1E6FB8; }
        .pcrs-meta-item.has-doc { background: rgba(139,92,246,0.08); color: #7c3aed; }
        .pcrs-meta-item.empty { background: #fef3c7; color: #92400e; }

        .pcrs-actions {
          display: flex; align-items: center; gap: 6px; padding: 0 16px;
          border-left: 1px solid #f1f5f9;
        }
        .pcrs-icon-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: transparent; cursor: pointer; display: grid; place-items: center;
          color: #64748b; transition: all 0.15s;
        }
        .pcrs-icon-btn:hover { background: #f1f5f9; color: #1e293b; }
        .pcrs-icon-btn.danger:hover { background: #fef2f2; color: #dc2626; }

        .pcrs-power {
          width: 36px; height: 36px; border-radius: 8px; border: none; cursor: pointer;
          display: grid; place-items: center; transition: all 0.15s;
        }
        .pcrs-power.on { background: rgba(34,197,94,0.1); color: #16a34a; }
        .pcrs-power.off { background: #f1f5f9; color: #cbd5e1; }

        /* Edit mode */
        .pcrs-edit { padding: 16px 20px; }
        .pcrs-edit-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        @media (max-width: 700px) { .pcrs-edit-row { grid-template-columns: 1fr; } }
        .pcrs-field { display: flex; flex-direction: column; gap: 4px; }
        .pcrs-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
        .pcrs-input, .pcrs-select {
          border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px;
          font-size: 13px; font-family: inherit; color: #1e293b; background: #fff;
          transition: border-color 0.15s;
        }
        .pcrs-input:focus, .pcrs-select:focus { outline: none; border-color: #2B8BDE; box-shadow: 0 0 0 3px rgba(43,139,222,0.1); }
        .pcrs-select { cursor: pointer; }
        .pcrs-actions-bar { display: flex; justify-content: flex-end; gap: 8px; }

        .pcrs-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 9px; font-size: 13px; font-weight: 600;
          cursor: pointer; border: none; transition: all 0.15s;
        }
        .pcrs-btn-primary { background: #2B8BDE; color: #fff; }
        .pcrs-btn-primary:hover { background: #1E6FB8; }
        .pcrs-btn-primary:disabled { opacity: 0.5; cursor: default; }
        .pcrs-btn-ghost { background: transparent; color: #64748b; border: 1px solid #e2e8f0; }
        .pcrs-btn-ghost:hover { background: #f8fafc; }

        .pcrs-add-card {
          background: #fff; border: 2px dashed #e2e8f0; border-radius: 14px;
          padding: 24px; margin-top: 4px;
        }
        .pcrs-add-card:hover { border-color: #cbd5e1; }

        .pcrs-add-trigger {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 16px; border: 2px dashed #e2e8f0; border-radius: 14px;
          cursor: pointer; transition: all 0.15s; color: #64748b; font-weight: 600;
          font-size: 14px; max-width: 900px;
        }
        .pcrs-add-trigger:hover { border-color: #2B8BDE; color: #2B8BDE; background: rgba(43,139,222,0.02); }
      `}</style>

      {/* Header */}
      <div className="pcrs-head">
        <div>
          <h2>
            Parcours client
            <span className="pcrs-badge-manual">
              <Check size={12} strokeWidth={3} /> 100% manuel
            </span>
          </h2>
          <p>
            Configurez les étapes du parcours client. Chaque étape associe un modèle d&apos;email
            et un document PDF. Les envois sont déclenchés manuellement depuis la vue Clients —
            aucun envoi automatique, aucun délai entre les niveaux.
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
          color: '#dc2626', fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Steps list */}
      <div className="pcrs-steps">
        {steps.length === 0 && !loading && (
          <div style={{
            textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, maxWidth: 900,
          }}>
            Aucune étape configurée. Cliquez sur « Ajouter une étape » pour commencer.
          </div>
        )}

        {steps.map((step, index) => {
          const isEditing = editingId === step.id
          const draft = isEditing ? editDraft : null

          return (
            <div key={step.id} className={`pcrs-card ${!step.isActive ? 'inactive' : ''}`}>
              {isEditing && draft ? (
                /* === Edit mode === */
                <div className="pcrs-edit">
                  <div className="pcrs-edit-row">
                    <div className="pcrs-field">
                      <label className="pcrs-label">Nom de l&apos;étape</label>
                      <input
                        className="pcrs-input"
                        type="text"
                        value={draft.name}
                        onChange={(e) => setEditDraft({ ...draft, name: e.target.value })}
                        placeholder="Accueil client"
                      />
                    </div>
                    <div className="pcrs-field">
                      <label className="pcrs-label">Description (optionnel)</label>
                      <input
                        className="pcrs-input"
                        type="text"
                        value={draft.description ?? ''}
                        onChange={(e) => setEditDraft({ ...draft, description: e.target.value || null })}
                        placeholder="Email de bienvenue"
                      />
                    </div>
                  </div>
                  <div className="pcrs-edit-row">
                    <div className="pcrs-field">
                      <label className="pcrs-label">Modèle d&apos;email</label>
                      <select
                        className="pcrs-select"
                        value={draft.templateId ?? ''}
                        onChange={(e) => setEditDraft({ ...draft, templateId: e.target.value || null })}
                      >
                        <option value="">— Aucun modèle —</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.language !== 'fr' ? `(${t.language.toUpperCase()})` : ''}
                            {t.status !== 'active' ? ' [brouillon]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="pcrs-field">
                      <label className="pcrs-label">Document PDF</label>
                      <select
                        className="pcrs-select"
                        value={draft.documentId ?? ''}
                        onChange={(e) => setEditDraft({ ...draft, documentId: e.target.value || null })}
                      >
                        <option value="">— Aucun document —</option>
                        {documents.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="pcrs-actions-bar">
                    <button className="pcrs-btn pcrs-btn-ghost" onClick={cancelEdit} disabled={!!savingId}>
                      <X size={15} /> Annuler
                    </button>
                    <button className="pcrs-btn pcrs-btn-primary" onClick={handleSaveEdit} disabled={!!savingId}>
                      {savingId ? (
                        <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      ) : (
                        <Save size={15} />
                      )}
                      {savingId ? 'Sauvegarde…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              ) : (
                /* === Display mode === */
                <div className="pcrs-card-body">
                  <div className="pcrs-grip">
                    <div className="pcrs-order-num">{step.order}</div>
                    <div className="pcrs-move-btns">
                      <button
                        className="pcrs-move-btn"
                        onClick={() => handleMove(index, -1)}
                        disabled={index === 0}
                        title="Monter"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        className="pcrs-move-btn"
                        onClick={() => handleMove(index, 1)}
                        disabled={index === steps.length - 1}
                        title="Descendre"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="pcrs-info">
                    <div className="pcrs-name">{step.name}</div>
                    {step.description && <div className="pcrs-desc">{step.description}</div>}

                    <div className="pcrs-meta">
                      {step.template ? (
                        <span className="pcrs-meta-item has-tpl">
                          <Mail size={12} /> {step.template.name}
                          {step.template.language !== 'fr' && ` (${step.template.language.toUpperCase()})`}
                        </span>
                      ) : (
                        <span className="pcrs-meta-item empty">
                          <Mail size={12} /> Aucun modèle
                        </span>
                      )}

                      {step.document ? (
                        <span className="pcrs-meta-item has-doc">
                          <FileText size={12} /> {step.document.name}
                        </span>
                      ) : (
                        <span className="pcrs-meta-item empty">
                          <FileText size={12} /> Aucun document
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pcrs-actions">
                    <button
                      className={`pcrs-power ${step.isActive ? 'on' : 'off'}`}
                      onClick={() => handleToggleActive(step)}
                      title={step.isActive ? 'Désactiver' : 'Activer'}
                    >
                      <Power size={16} />
                    </button>
                    <button className="pcrs-icon-btn" onClick={() => startEdit(step)} title="Modifier">
                      <Save size={16} />
                    </button>
                    <button className="pcrs-icon-btn danger" onClick={() => handleDelete(step)} title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new step */}
      {showAddForm ? (
        <div className="pcrs-add-card" style={{ maxWidth: 900, marginTop: 12 }}>
          <div className="pcrs-edit-row">
            <div className="pcrs-field">
              <label className="pcrs-label">Nom de l&apos;étape</label>
              <input
                className="pcrs-input"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Accueil client"
                autoFocus
              />
            </div>
            <div className="pcrs-field">
              <label className="pcrs-label">Description</label>
              <input
                className="pcrs-input"
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Email de bienvenue"
              />
            </div>
          </div>
          <div className="pcrs-edit-row">
            <div className="pcrs-field">
              <label className="pcrs-label">Modèle d&apos;email</label>
              <select
                className="pcrs-select"
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value)}
              >
                <option value="">— Aucun modèle —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.language !== 'fr' ? `(${t.language.toUpperCase()})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="pcrs-field">
              <label className="pcrs-label">Document PDF</label>
              <select
                className="pcrs-select"
                value={newDocumentId}
                onChange={(e) => setNewDocumentId(e.target.value)}
              >
                <option value="">— Aucun document —</option>
                {documents.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="pcrs-actions-bar">
            <button className="pcrs-btn pcrs-btn-ghost" onClick={() => setShowAddForm(false)} disabled={adding}>
              <X size={15} /> Annuler
            </button>
            <button className="pcrs-btn pcrs-btn-primary" onClick={handleAdd} disabled={adding || !newName.trim()}>
              {adding ? (
                <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <Plus size={15} />
              )}
              {adding ? 'Création…' : 'Créer l\'étape'}
            </button>
          </div>
        </div>
      ) : (
        <button className="pcrs-add-trigger" onClick={() => setShowAddForm(true)} style={{ marginTop: 12 }}>
          <Plus size={18} /> Ajouter une étape
        </button>
      )}
    </section>
  )
}
