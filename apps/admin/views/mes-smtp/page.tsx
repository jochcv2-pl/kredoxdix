'use client'

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// =============================================================================
// Vue "Mes SMTP" (DEC-K5 multi-admin).
// Le conseiller gère SES passerelles d'envoi (l'API filtre par ownerId).
// Sans SMTP personnel → fallback automatique sur le SMTP système.
// =============================================================================

interface Gateway {
  id: string
  provider: 'resend' | 'brevo' | 'smtp'
  label: string
  apiKey: string | null
  config: Record<string, unknown>
  isActive: boolean
  isPrimary: boolean
  isSystem?: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  resend: 'Resend',
  brevo: 'Brevo',
  smtp: 'SMTP personnalisé',
}

interface FormState {
  provider: 'resend' | 'brevo' | 'smtp'
  label: string
  apiKey: string
  smtpHost: string
  smtpPort: string
  smtpUsername: string
  smtpFrom: string
  isActive: boolean
  isPrimary: boolean
}

const EMPTY_FORM: FormState = {
  provider: 'smtp',
  label: '',
  apiKey: '',
  smtpHost: '',
  smtpPort: '587',
  smtpUsername: '',
  smtpFrom: '',
  isActive: true,
  isPrimary: false,
}

export default function MesSmtp() {
  const [list, setList] = useState<Gateway[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Gateway | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/gateways', { cache: 'no-store' })
      if (!res.ok) throw new Error('Chargement échoué')
      const json = await res.json()
      setList(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setCreating(true)
    setError(null)
    setTestResult(null)
  }

  const handleSave = async () => {
    if (!form.label.trim()) { setError('Nom requis'); return }
    if (!form.apiKey.trim()) { setError(form.provider === 'smtp' ? 'Mot de passe SMTP requis' : 'Clé API requise'); return }
    if (form.provider === 'smtp' && !form.smtpHost.trim()) { setError('Hôte SMTP requis'); return }

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        label: form.label.trim(),
        apiKey: form.apiKey.trim(),
        isActive: form.isActive,
        isPrimary: form.isPrimary,
      }

      if (form.provider === 'smtp') {
        body.config = {
          host: form.smtpHost.trim(),
          port: Number(form.smtpPort) || 587,
          username: form.smtpUsername.trim(),
          from: form.smtpFrom.trim() || form.smtpUsername.trim(),
          mode: 'tls',
        }
      } else {
        body.config = {}
      }

      // Si c'est la première passerelle, elle devient primaire par défaut.
      if (list.length === 0 && !form.isPrimary) {
        body.isPrimary = true
      }

      const res = await fetch('/api/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Création échouée')
      }
      setCreating(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (id: string, active: boolean) => {
    try {
      await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: active }),
      })
      await load()
    } catch {
      setError('Échec de la modification')
    }
  }

  const setPrimary = async (id: string) => {
    try {
      await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      })
      await load()
    } catch {
      setError('Échec')
    }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/gateways/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Suppression échouée')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResult(null)
    try {
      const res = await fetch(`/api/gateways/${id}/test`, { method: 'POST' })
      const json = await res.json()
      const data = json.data ?? json
      setTestResult(data?.success
        ? `✅ Email de test envoyé avec succès`
        : `❌ ${data?.error ?? 'Échec du test'}`)
    } catch {
      setTestResult('❌ Erreur lors du test')
    } finally {
      setTestingId(null)
    }
  }

  if (loading) return <div className="loading-state">Chargement…</div>

  return (
    <div className="view-content">
      {error && (
        <div className="alert alert-error" style={{ cursor: 'pointer' }} onClick={() => setError(null)}>{error}</div>
      )}
      {testResult && (
        <div className="info-band" style={{ cursor: 'pointer' }} onClick={() => setTestResult(null)}>
          <div className="imark">i</div><div>{testResult}</div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Mes passerelles d&apos;envoi ({list.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Ajouter un SMTP</button>
        </div>
        <div className="panel-body">
          {list.length === 0 ? (
            <div className="card-grid-empty">
              Aucune passerelle configurée. Vos emails utilisent actuellement le <b>SMTP système</b>.
              Créez votre propre passerelle pour personnaliser l&apos;expédition.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {list.map((gw) => (
                <div
                  key={gw.id}
                  style={{
                    border: `2px solid ${gw.isActive ? 'var(--blue, #2B8BDE)' : 'var(--line, #e5e7eb)'}`,
                    borderRadius: 10,
                    padding: '14px 18px',
                    background: gw.isActive ? 'rgba(43, 139, 222, 0.03)' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={gw.isActive}
                        onChange={(e) => toggleActive(gw.id, e.target.checked)}
                        title="Activer / désactiver"
                      />
                      <div>
                        <b>{gw.label}</b>
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                          {PROVIDER_LABELS[gw.provider] ?? gw.provider}
                        </span>
                      </div>
                      {gw.isPrimary && (
                        <span className="prov-badge" style={{ background: '#2563eb' }}>⭐ Principale</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleTest(gw.id)}
                        disabled={testingId === gw.id}
                        style={{ fontSize: 12, padding: '4px 10px' }}
                      >
                        {testingId === gw.id ? 'Test…' : 'Tester'}
                      </button>
                      {!gw.isPrimary && gw.isActive && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setPrimary(gw.id)}
                          style={{ fontSize: 12, padding: '4px 10px', color: '#2563eb' }}
                        >
                          ⭐ Définir principale
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleteTarget(gw)}
                        style={{ fontSize: 12, padding: '4px 10px', color: 'var(--red, #dc2626)' }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  {gw.provider === 'smtp' && gw.config && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                      {String(gw.config.host ?? '—')}:{String(gw.config.port ?? '587')}
                      {gw.config.username ? ` · ${String(gw.config.username)}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal création */}
      <Modal
        isOpen={creating}
        onClose={() => { setCreating(false); setError(null) }}
        title="Nouvelle passerelle d'envoi"
        wide
      >
        <div className="modal-fg">
          <label>Fournisseur</label>
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as 'resend' | 'brevo' | 'smtp' })}
          >
            <option value="smtp">SMTP personnalisé (recommandé)</option>
            <option value="resend">Resend (API)</option>
            <option value="brevo">Brevo / Sendinblue (API)</option>
          </select>

          <label>Nom <span style={{ color: '#aaa' }}>(libre, pour vous repérer)</span></label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Ex : SMTP Hostinger"
            autoFocus
          />

          <label>{form.provider === 'smtp' ? 'Mot de passe SMTP' : 'Clé API'}</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder={form.provider === 'brevo' ? 'xkeysib-…' : form.provider === 'resend' ? 're_…' : 'Mot de passe SMTP'}
          />

          {form.provider === 'smtp' && (
            <>
              <label>Hôte SMTP</label>
              <input
                type="text"
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                placeholder="smtp.example.com"
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label>Port</label>
                  <input
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
                    placeholder="587"
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label>Nom d&apos;utilisateur</label>
                  <input
                    type="text"
                    value={form.smtpUsername}
                    onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <label>Adresse d&apos;expédition (From) <span style={{ color: '#aaa' }}>(vide = identique à l'utilisateur)</span></label>
              <input
                type="email"
                value={form.smtpFrom}
                onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
                placeholder="contact@votre-domaine.fr"
              />
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Activer immédiatement
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isPrimary || list.length === 0}
              onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              disabled={list.length === 0}
            />
            Définir comme principale {list.length === 0 && '(automatique — première passerelle)'}
          </label>

          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setError(null) }}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Création…' : 'Créer la passerelle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation suppression */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer la passerelle"
        message={<>Supprimer définitivement <strong>{deleteTarget?.label}</strong> ? Si c&apos;était votre passerelle principale, vos emails utiliseront le SMTP système.</>}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
