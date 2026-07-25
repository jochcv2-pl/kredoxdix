'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Types — alignés sur le modèle Prisma Agent + AgentMemory.
// =============================================================================

type TabId = 'role' | 'memoire' | 'outils'

interface AgentTool {
  on: boolean
  desc: string
}

interface AgentMemory {
  id?: string // présent côté DB ; absent pour une nouvelle ligne non persistée
  key: string
  value: string
  _pendingDelete?: boolean // marquage local avant suppression effective
  _dirty?: boolean // modifié localement, à sauvegarder au prochain "Enregistrer"
}

interface Agent {
  id: string
  role: string
  name: string
  initials: string
  description: string
  isActive: boolean
  systemPrompt: string
  tools: Record<string, AgentTool>
  guardrails: Record<string, string>
  memories: AgentMemory[]
  _promptDirty?: boolean
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'role', label: 'Rôle' },
  { id: 'memoire', label: 'Mémoire' },
  { id: 'outils', label: 'Fonctionnement' },
]

// =============================================================================
// Composant principal
// =============================================================================

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('role')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [deleteMemTarget, setDeleteMemTarget] = useState<{ agentId: string; mem: AgentMemory } | null>(null)

  // ---------------------------------------------------------------------------
  // Chargement initial — GET /api/agents (avec compte mémoire).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/agents')
        if (!res.ok) throw new Error('Échec chargement agents')
        const json = await res.json()
        const list: Agent[] = (json.data ?? json).map((a: Agent) => ({
          ...a,
          memories: (a.memories ?? []).map((m: AgentMemory) => ({ ...m, _dirty: false })),
        }))
        if (cancelled) return
        setAgents(list)
        setActiveAgentId(list[0]?.id ?? null)
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

  const agent = agents.find((a) => a.id === activeAgentId) ?? agents[0] ?? null

  // ---------------------------------------------------------------------------
  // Handlers locaux (état réactif).
  // ---------------------------------------------------------------------------

  const updateAgent = (id: string, patch: Partial<Agent>) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const updateMemoryValue = (agentId: string, memId: string | undefined, value: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a
        return {
          ...a,
          memories: a.memories.map((m) =>
            (m.id ?? undefined) === memId ? { ...m, value, _dirty: true } : m,
          ),
        }
      }),
    )
  }

  const addMemoryRow = (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a
        return {
          ...a,
          memories: [
            ...a.memories,
            { key: `cle_${Date.now().toString(36)}`, value: '', _dirty: true },
          ],
        }
      }),
    )
  }

  // Toggle local d'un outil (non persisté tant qu'on n'appuie pas sur Enregistrer).
  const toggleTool = (agentId: string, toolName: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a
        const cur = a.tools[toolName] ?? { on: false, desc: '' }
        return { ...a, tools: { ...a.tools, [toolName]: { ...cur, on: !cur.on } } }
      }),
    )
  }

  // Bascule isActive — PATCH immédiat (champ isolé, pas besoin de modal).
  const toggleActive = async (agentId: string, currentActive: boolean) => {
    setError(null)
    const next = !currentActive
    // Optimistic update
    updateAgent(agentId, { isActive: next })
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      if (!res.ok) throw new Error('Échec bascule isActive')
    } catch (e) {
      // Rollback
      updateAgent(agentId, { isActive: currentActive })
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  // ---------------------------------------------------------------------------
  // Sauvegarde globale — PATCH agent + sync mémoire (CRUD).
  // ---------------------------------------------------------------------------

  const saveAgent = async () => {
    if (!agent) return
    setSaving(true)
    setError(null)
    try {
      // 1. PATCH agent (name, description, tools, guardrails, systemPrompt si modifié).
      const patchBody: Record<string, unknown> = {
        name: agent.name,
        description: agent.description,
        tools: agent.tools,
        guardrails: agent.guardrails,
      }
      if (agent._promptDirty) {
        patchBody.systemPrompt = agent.systemPrompt
      }
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      if (!res.ok) throw new Error('Échec PATCH agent')

      // 2. Sync mémoire : pour chaque entrée locale, créer / mettre à jour / supprimer.
      for (const m of agent.memories) {
        if (m._pendingDelete && m.id) {
          const r = await fetch(`/api/agents/${agent.id}/memories/${m.id}`, { method: 'DELETE' })
          if (!r.ok && r.status !== 204) throw new Error(`Échec suppression mémoire ${m.key}`)
        } else if (!m.id && !m._pendingDelete) {
          // Nouvelle entrée
          if (!m.key.trim() || !m.value.trim()) continue
          const r = await fetch(`/api/agents/${agent.id}/memories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: m.key, value: m.value }),
          })
          if (!r.ok) throw new Error(`Échec création mémoire ${m.key}`)
        } else if (m._dirty && m.id) {
          // Mise à jour valeur (la clé reste fixe côté API).
          const r = await fetch(`/api/agents/${agent.id}/memories/${m.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: m.value }),
          })
          if (!r.ok) throw new Error(`Échec MAJ mémoire ${m.key}`)
        }
      }

      // 3. Recharge l'agent pour réinitialiser les flags _dirty/_pendingDelete.
      const fresh = await fetch(`/api/agents/${agent.id}`).then((r) => r.json())
      const freshAgent: Agent = fresh.data ?? fresh
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id
            ? {
                ...freshAgent,
                memories: freshAgent.memories.map((mm: AgentMemory) => ({ ...mm, _dirty: false })),
              }
            : a,
        ),
      )
      setSaveModalOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  // Suppression mémoire — local pending, effective au prochain save.
  const confirmDeleteMemory = () => {
    if (!deleteMemTarget) return
    const { agentId, mem } = deleteMemTarget
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a
        return {
          ...a,
          memories: a.memories.map((m) =>
            (m.id ?? undefined) === (mem.id ?? undefined) && m.key === mem.key
              ? { ...m, _pendingDelete: true }
              : m,
          ),
        }
      }),
    )
    setDeleteMemTarget(null)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <section className="view" id="agents">
        <p className="field-hint">Chargement des agents…</p>
      </section>
    )
  }

  if (!agent) {
    return (
      <section className="view" id="agents">
        <p className="field-hint">Aucun agent configuré.</p>
      </section>
    )
  }

  // Mémoires visibles = celles non marquées _pendingDelete.
  const visibleMemories = agent.memories.filter((m) => !m._pendingDelete)

  return (
    <section className="view" id="agents">
      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      <div className="agents-layout">
        <div className="agent-list">
          <div className="agent-list-head">
            <h3>Agents</h3>
          </div>
          {agents.map((a) => (
            <div
              key={a.id}
              className={a.id === activeAgentId ? 'agent-item active' : 'agent-item'}
              onClick={() => setActiveAgentId(a.id)}
            >
              <div className="an">
                <span className={`status-dot ${a.isActive ? 'on' : 'off'}`}></span>
                <b>{a.name}</b>
              </div>
              <div className="adesc">{a.description}</div>
            </div>
          ))}
        </div>

        <div className="agent-editor">
          <div className="ae-head">
            <div className="aeleft">
              <div className="ae-avatar">{agent.initials}</div>
              <div>
                <h2>{agent.name}</h2>
                <div className="aerole">{agent.description}</div>
              </div>
            </div>
            <div className="toggle" onClick={() => toggleActive(agent.id, agent.isActive)}>
              <span>Actif</span>
              <div className={`toggle-track${agent.isActive ? '' : ' off'}`}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>

          <div className="ae-tabs">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={activeTab === t.id ? 'ae-tab active' : 'ae-tab'}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </div>
            ))}
          </div>

          <div className="ae-body">
            {activeTab === 'role' && (
              <div className="ae-tabpane active">
                <div className="field-title">Instruction système</div>
                <div className="field-hint">
                  Définit la mission et les limites de l&apos;agent. Modifiable — les changements sont appliqués au prochain clic sur « Enregistrer l&apos;agent ».
                </div>
                <textarea
                  className="code-area"
                  defaultValue={agent.systemPrompt}
                  onChange={(e) => {
                    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, systemPrompt: e.target.value, _promptDirty: true } : a))
                  }}
                  rows={8}
                />
              </div>
            )}

            {activeTab === 'memoire' && (
              <div className="ae-tabpane active">
                <div className="field-title">Fichier mémoire</div>
                <div className="field-hint">
                  Connaissances et règles métier utilisées par l&apos;agent. Modifiez directement les champs ci-dessous pour mettre à jour la stratégie et les connaissances de l&apos;agent. Les modifications sont persistées au clic sur « Enregistrer l&apos;agent ».
                </div>
                <div className="mem-list">
                  {visibleMemories.map((m) => (
                    <div className="mem-item-edit" key={m.id ?? m.key}>
                      <input className="mem-key-input" value={m.key} readOnly />
                      <textarea
                        className="mem-val-input"
                        value={m.value}
                        onChange={(e) => updateMemoryValue(agent.id, m.id, e.target.value)}
                        placeholder="Valeur — décrivez la règle ou connaissance..."
                        rows={1}
                      />
                      <button
                        className="mem-delete"
                        onClick={() => setDeleteMemTarget({ agentId: agent.id, mem: m })}
                        title="Supprimer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button className="mem-add-btn" onClick={() => addMemoryRow(agent.id)} style={{ marginTop: 10 }}>
                  + Ajouter une entrée mémoire
                </button>
              </div>
            )}

            {activeTab === 'outils' && (
              <div className="ae-tabpane active">
                <div className="field-title">Outils autorisés (liste blanche)</div>
                <div className="field-hint">
                  L&apos;agent ne peut appeler que les fonctions activées ici. Les toggles sont persistés au clic sur « Enregistrer l&apos;agent ».
                </div>
                <div className="tool-grid">
                  {Object.entries(agent.tools).map(([name, tool]) => (
                    <div className="tool" key={name}>
                      <div>
                        <div className="tool-name">{name}</div>
                        <div className="tool-desc">{tool.desc}</div>
                      </div>
                      <div
                        className={`mini-toggle${tool.on ? '' : ' off'}`}
                        onClick={() => toggleTool(agent.id, name)}
                      >
                        <div className="mini-knob"></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="field-title" style={{ marginTop: '22px' }}>Garde-fous</div>
                <div className="field-hint">Limites appliquées automatiquement (lecture seule — éditables via API).</div>
                <div className="mem-list">
                  {Object.entries(agent.guardrails).map(([key, val]) => (
                    <div className="mem-item" key={key}>
                      <span className="mem-key">{key}</span>
                      <span className="mem-val">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="ae-foot">
            <span className="saved">
              Rôle <code>{agent.role}</code> · ID <code>{agent.id}</code>
            </span>
            <button className="btn btn-primary" onClick={() => setSaveModalOpen(true)}>
              Enregistrer l&apos;agent
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL SAVE
          ========================================================================= */}
      <Modal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Enregistrer l'agent"
      >
        <p className="field-hint">
          Les modifications seront sauvegardées et appliquées immédiatement. L&apos;historique des changements est conservé.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
          <b>Agent :</b> {agent.name}<br />
          <b>Rôle :</b> {agent.description}<br />
          <b>Statut :</b> {agent.isActive ? 'Actif' : 'Inactif'}
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setSaveModalOpen(false)} disabled={saving}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={saveAgent} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Confirmer l\'enregistrement'}
          </button>
        </div>
      </Modal>

      {/* =========================================================================
          DELETE MEMORY CONFIRM
          ========================================================================= */}
      <ConfirmDialog
        isOpen={!!deleteMemTarget}
        variant="danger"
        title="Supprimer la mémoire"
        message={
          <>
            Voulez-vous vraiment supprimer la clé <strong>{deleteMemTarget?.mem.key}</strong> ?
            {' '}Elle sera effectivement supprimée de la base au prochain « Enregistrer l&apos;agent ».
          </>
        }
        confirmLabel="Supprimer"
        onConfirm={confirmDeleteMemory}
        onClose={() => setDeleteMemTarget(null)}
      />
    </section>
  )
}
