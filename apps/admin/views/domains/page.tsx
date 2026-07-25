'use client'

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'

// =============================================================================
// Domaines — gestion des domaines et sous-domaines (multi-domaines / multi-marques).
// Données servies par /api/domains.
// =============================================================================

type DomainType = 'site' | 'admin' | 'mail' | 'brand'
type SslStatus = 'pending' | 'active' | 'error'

interface Domain {
  id: string
  domain: string
  type: DomainType
  brandName: string | null
  logoUrl: string | null
  primaryColor: string | null
  isActive: boolean
  isPrimary: boolean
  sslStatus: string
  createdAt: string
  updatedAt: string
}

const TYPE_CONFIG: Record<DomainType, { label: string; cls: string; desc: string; ex: string }> = {
  site:  { label: 'Site public',    cls: 'b-client',  desc: 'Site public principal',          ex: 'votredomaine.com' },
  admin: { label: 'Admin CRM',      cls: 'b-offer',   desc: 'Interface admin CRM',            ex: 'crm.votredomaine.com' },
  mail:  { label: 'Envoi emails',   cls: 'b-contact', desc: "Domaine d'envoi d'emails",       ex: 'mail.votredomaine.com' },
  brand: { label: 'Marque blanche', cls: 'b-new',     desc: 'Marque blanche / domaine secondaire', ex: 'moncredit.fr' },
}

const SSL_CONFIG: Record<SslStatus, { label: string; cls: string }> = {
  active:  { label: 'SSL actif',   cls: 'b-client' },
  pending: { label: 'SSL en attente', cls: 'b-new' },
  error:   { label: 'SSL erreur',  cls: 'b-lost' },
}

const EMPTY_FORM: DomainForm = {
  domain: '',
  type: 'site',
  brandName: '',
  primaryColor: '',
  isPrimary: false,
  isActive: true,
}

interface DomainForm {
  domain: string
  type: DomainType
  brandName: string
  primaryColor: string
  isPrimary: boolean
  isActive: boolean
}

export default function Domains() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DomainForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Domain | null>(null)

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    domain: string
    dns: { resolved: boolean; ips: string[]; error: string | null }
    ssl: { valid: boolean; issuer: string | null; daysLeft: number | null; error: string | null }
    https: { reachable: boolean; statusCode: number | null; latencyMs: number | null; error?: string }
    sslStatus: string
  } | null>(null)
  const [testModalOpen, setTestModalOpen] = useState(false)

  const fetchDomains = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/domains')
      const json = await res.json()
      if (json.data) {
        setDomains(json.data)
      } else if (json.error) {
        setError(json.error)
      }
    } catch (e) {
      console.error('fetchDomains:', e)
      setError('Impossible de charger les domaines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (d: Domain) => {
    setEditingId(d.id)
    setForm({
      domain: d.domain,
      type: d.type,
      brandName: d.brandName ?? '',
      primaryColor: d.primaryColor ?? '',
      isPrimary: d.isPrimary,
      isActive: d.isActive,
    })
    setFormError(null)
    setModalOpen(true)
  }

  const handleSave = async () => {
    setFormError(null)
    if (!form.domain.trim()) {
      setFormError('Le domaine est requis')
      return
    }
    setSaving(true)
    try {
      const payload = {
        domain: form.domain.trim().toLowerCase(),
        type: form.type,
        brandName: form.brandName.trim() || undefined,
        primaryColor: form.primaryColor.trim() || undefined,
        isPrimary: form.isPrimary,
        isActive: form.isActive,
      }
      const url = editingId ? `/api/domains/${editingId}` : '/api/domains'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setFormError(json.error ?? 'Erreur lors de la sauvegarde')
        return
      }
      setModalOpen(false)
      await fetchDomains()
    } catch (e) {
      console.error('handleSave:', e)
      setFormError('Erreur réseau lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (d: Domain) => {
    try {
      const res = await fetch(`/api/domains/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !d.isActive }),
      })
      if (res.ok) await fetchDomains()
    } catch (e) {
      console.error('handleToggleActive:', e)
    }
  }

  const handleTogglePrimary = async (d: Domain) => {
    try {
      const res = await fetch(`/api/domains/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: !d.isPrimary }),
      })
      if (res.ok) await fetchDomains()
    } catch (e) {
      console.error('handleTogglePrimary:', e)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/domains/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.status === 204) {
        await fetchDomains()
      } else {
        const json = await res.json().catch(() => null)
        setError(json?.error ?? 'Suppression impossible')
      }
    } catch (e) {
      console.error('handleDelete:', e)
      setError('Erreur réseau lors de la suppression')
    }
  }

  const handleTest = async (d: Domain) => {
    setTestingId(d.id)
    setTestResult(null)
    setTestModalOpen(true)
    try {
      const res = await fetch(`/api/domains/${d.id}/test`, { method: 'POST' })
      const json = await res.json()
      const data = json.data ?? json
      setTestResult(data)
      // Rafraîchit la liste pour mettre à jour le badge SSL
      if (data.sslStatus && data.sslStatus !== d.sslStatus) {
        await fetchDomains()
      }
    } catch (e) {
      console.error('handleTest:', e)
      setTestResult({
        domain: d.domain,
        dns: { resolved: false, ips: [], error: 'Erreur réseau' },
        ssl: { valid: false, issuer: null, daysLeft: null, error: 'Test impossible' },
        https: { reachable: false, statusCode: null, latencyMs: null, error: 'Erreur réseau' },
        sslStatus: d.sslStatus,
      })
    } finally {
      setTestingId(null)
    }
  }

  return (
    <section className="view" id="domains">
      <style>{`
        .domains-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }
        .domains-head h2 { margin: 0; }
        .domains-head .sub { color: var(--slate, #64748b); font-size: 14px; margin-top: 4px; }

        .domains-info {
          background: color-mix(in srgb, var(--blue-deep, #1e3a8a) 6%, var(--bg, #fff));
          border: 1px solid color-mix(in srgb, var(--blue-deep, #1e3a8a) 25%, var(--border, #e5e7eb));
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 20px;
        }
        .domains-info-title {
          font-weight: 600;
          color: var(--text, #111);
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .domains-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
        }
        .domains-info-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .domains-info-item .it-head { display: flex; align-items: center; gap: 8px; }
        .domains-info-item .it-name { font-weight: 600; font-size: 13px; }
        .domains-info-item .it-desc { font-size: 12px; color: var(--slate, #64748b); }
        .domains-info-item .it-ex { font-size: 12px; color: var(--slate, #94a3b8); font-family: monospace; }

        .domain-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
          background: var(--white, #fff);
          margin-bottom: 10px;
        }
        .domain-card.inactive { opacity: 0.55; }
        .domain-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .domain-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--text, #111);
          display: flex;
          align-items: center;
          gap: 8px;
          word-break: break-all;
        }
        .domain-primary-star { color: var(--orange, #f59e0b); font-size: 16px; line-height: 1; cursor: pointer; }
        .domain-brand { font-size: 12px; color: var(--slate, #64748b); }
        .domain-badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

        .domain-actions { display: flex; align-items: center; gap: 8px; }

        .mini-toggle {
          width: 38px;
          height: 22px;
          background: var(--green, #22c55e);
          border-radius: 999px;
          position: relative;
          cursor: pointer;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .mini-toggle.off { background: var(--border, #cbd5e1); }
        .mini-toggle .mini-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          background: var(--white, #fff);
          border-radius: 50%;
          transition: left 0.15s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .mini-toggle.off .mini-knob { left: 18px; }

        .domains-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--slate, #64748b);
        }

        .domains-loading { padding: 40px; text-align: center; color: var(--slate, #64748b); }
        .domains-err {
          background: color-mix(in srgb, var(--red, #ef4444) 8%, var(--bg, #fff));
          border: 1px solid color-mix(in srgb, var(--red, #ef4444) 30%, var(--border, #e5e7eb));
          color: var(--red, #ef4444);
          padding: 10px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 13px;
        }

        .domain-form { display: flex; flex-direction: column; gap: 14px; }
        .color-row { display: flex; align-items: center; gap: 8px; }
        .color-row input[type="color"] {
          width: 38px; height: 38px; padding: 0; border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px; background: none; cursor: pointer;
        }
        .check-row { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; }
      `}</style>

      <div className="domains-head">
        <div>
          <h2>Domaines</h2>
          <div className="sub">Gérez vos domaines et sous-domaines</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Ajouter un domaine</button>
      </div>

      <div className="domains-info">
        <div className="domains-info-title">
          <Icon name="shield" size={16} /> Types de domaines
        </div>
        <div className="domains-info-grid">
          {(Object.keys(TYPE_CONFIG) as DomainType[]).map((t) => (
            <div className="domains-info-item" key={t}>
              <div className="it-head">
                <span className={`badge ${TYPE_CONFIG[t].cls}`}><span className="badge-dot"></span>{TYPE_CONFIG[t].label}</span>
              </div>
              <div className="it-desc">{TYPE_CONFIG[t].desc}</div>
              <div className="it-ex">{TYPE_CONFIG[t].ex}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="domains-err">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h3>Domaines configurés ({domains.length})</h3>
          <button className="btn btn-ghost btn-sm" onClick={fetchDomains} title="Rafraîchir">
            <Icon name="refresh-cw" size={16} />
          </button>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="domains-loading">Chargement des domaines…</div>
          ) : domains.length === 0 ? (
            <div className="domains-empty">Aucun domaine configuré. Cliquez sur « Ajouter un domaine ».</div>
          ) : (
            domains.map((d) => {
              const ssl = (SSL_CONFIG[d.sslStatus as SslStatus] ?? SSL_CONFIG.pending)
              return (
                <div key={d.id} className={`domain-card${d.isActive ? '' : ' inactive'}`}>
                  <div className="domain-main">
                    <div className="domain-name">
                      <span
                        className="domain-primary-star"
                        title={d.isPrimary ? 'Domaine primaire — cliquer pour retirer' : 'Définir comme primaire'}
                        onClick={() => handleTogglePrimary(d)}
                      >
                        {d.isPrimary ? '★' : '☆'}
                      </span>
                      {d.domain}
                    </div>
                    {d.brandName && <div className="domain-brand">{d.brandName}</div>}
                    <div className="domain-badges">
                      <span className={`badge ${TYPE_CONFIG[d.type].cls}`}>
                        <span className="badge-dot"></span>{TYPE_CONFIG[d.type].label}
                      </span>
                      <span className={`badge ${ssl.cls}`}>
                        <span className="badge-dot"></span>{ssl.label}
                      </span>
                    </div>
                  </div>

                  <div className="domain-actions">
                    <div
                      className={`mini-toggle${d.isActive ? '' : ' off'}`}
                      title={d.isActive ? 'Désactiver' : 'Activer'}
                      onClick={() => handleToggleActive(d)}
                    >
                      <div className="mini-knob"></div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleTest(d)}
                      disabled={testingId === d.id}
                    >
                      {testingId === d.id ? 'Test…' : 'Tester'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>Éditer</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(d)}>Supprimer</button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Modifier le domaine' : 'Ajouter un domaine'}
      >
        <div className="domain-form">
          <div className="field">
            <label className="field-label">Domaine</label>
            <input
              className="field-input"
              type="text"
              placeholder="exemple.fr"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label">Type</label>
            <select
              className="field-select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as DomainType })}
            >
              {(Object.keys(TYPE_CONFIG) as DomainType[]).map((t) => (
                <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label">Nom de marque (optionnel)</label>
            <input
              className="field-input"
              type="text"
              placeholder="Ex : Kredix"
              value={form.brandName}
              onChange={(e) => setForm({ ...form, brandName: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label">Couleur principale (optionnel)</label>
            <div className="color-row">
              <input
                type="color"
                value={form.primaryColor || '#1e3a8a'}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
              <input
                className="field-input"
                type="text"
                placeholder="#1e3a8a"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
            </div>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
            />
            Domaine primaire pour ce type
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Actif
          </label>

          {formError && <div className="domains-err">{formError}</div>}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.domain.trim()}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer le domaine"
        message={
          <>
            Voulez-vous vraiment supprimer le domaine <strong>{deleteTarget?.domain}</strong> ?
            Cette action est irréversible.
          </>
        }
        confirmLabel="Supprimer"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Modal résultats test DNS/SSL */}
      <Modal
        isOpen={testModalOpen}
        onClose={() => { setTestModalOpen(false); setTestResult(null) }}
        title={`Test du domaine — ${testResult?.domain ?? '…'}`}
      >
        {!testResult && (
          <p className="field-hint">Test en cours… Résolution DNS, vérification SSL et connexion HTTPS.</p>
        )}

        {testResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* DNS */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {testResult.dns.resolved ? (
                  <span style={{ color: 'var(--green, #22c55e)', fontWeight: 600 }}>✓ DNS résolu</span>
                ) : (
                  <span style={{ color: 'var(--red, #ef4444)', fontWeight: 600 }}>✗ DNS échoué</span>
                )}
              </div>
              {testResult.dns.resolved ? (
                <div style={{ fontSize: 13, color: 'var(--slate, #64748b)' }}>
                  Adresses IP : {testResult.dns.ips.join(', ')}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--red, #ef4444)', fontFamily: 'monospace' }}>
                  {testResult.dns.error}
                </div>
              )}
            </div>

            {/* SSL */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {testResult.ssl.valid ? (
                  <span style={{ color: 'var(--green, #22c55e)', fontWeight: 600 }}>✓ Certificat SSL valide</span>
                ) : (
                  <span style={{ color: 'var(--red, #ef4444)', fontWeight: 600 }}>✗ SSL invalide ou absent</span>
                )}
              </div>
              {testResult.ssl.valid ? (
                <div style={{ fontSize: 13, color: 'var(--slate, #64748b)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {testResult.ssl.issuer && <div>Émetteur : <b>{testResult.ssl.issuer}</b></div>}
                  {testResult.ssl.daysLeft != null && (
                    <div style={{
                      color: testResult.ssl.daysLeft < 7 ? 'var(--red, #ef4444)'
                        : testResult.ssl.daysLeft < 30 ? 'var(--orange, #f59e0b)'
                        : 'var(--slate, #64748b)'
                    }}>
                      Expire dans <b>{testResult.ssl.daysLeft} jours</b>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--red, #ef4444)', fontFamily: 'monospace' }}>
                  {testResult.ssl.error || 'Certificat invalide ou inexistant'}
                </div>
              )}
            </div>

            {/* HTTPS */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {testResult.https.reachable ? (
                  <span style={{ color: 'var(--green, #22c55e)', fontWeight: 600 }}>✓ Serveur HTTPS accessible</span>
                ) : (
                  <span style={{ color: 'var(--red, #ef4444)', fontWeight: 600 }}>✗ Serveur injoignable</span>
                )}
              </div>
              {testResult.https.reachable ? (
                <div style={{ fontSize: 13, color: 'var(--slate, #64748b)' }}>
                  Code HTTP : <b>{testResult.https.statusCode}</b>
                  {testResult.https.latencyMs != null && <> · Latence : <b>{testResult.https.latencyMs} ms</b></>}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--red, #ef4444)', fontFamily: 'monospace' }}>
                  {testResult.https.error || 'Connexion refusée ou timeout'}
                </div>
              )}
            </div>

            <div style={{
              fontSize: 12, color: 'var(--slate, #94a3b8)', borderTop: '1px solid var(--border, #e5e7eb)',
              paddingTop: 12, marginTop: 4,
            }}>
              Statut SSL mis à jour : <b>{testResult.sslStatus}</b>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setTestModalOpen(false); setTestResult(null) }}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
