'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'

// =============================================================================
// Partners — CRUD des banques partenaires affichées sur la landing publique.
// =============================================================================

interface BankPartner {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  isActive: boolean
  displayOrder: number
  _count?: { rates: number }
}

interface FormState {
  name: string
  slug: string
  logoUrl: string
  contactEmail: string
  contactPhone: string
  isActive: boolean
  displayOrder: number
}

const EMPTY: FormState = {
  name: '', slug: '', logoUrl: '',
  contactEmail: '', contactPhone: '',
  isActive: true, displayOrder: 0,
}

// Types MIME acceptés côté client (sync avec l'API).
const ACCEPTED_TYPES = '.png,.jpg,.jpeg,.ico,.webp,.gif'
const MAX_FILE_SIZE = 500 * 1024 // 500 Ko

export default function Partners() {
  const [list, setList] = useState<BankPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BankPartner | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<BankPartner | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bank-partners')
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
    setForm({ ...EMPTY, displayOrder: list.length })
    setEditing(null)
    setUploadError(null)
    setCreating(true)
  }

  const openEdit = (p: BankPartner) => {
    setForm({
      name: p.name,
      slug: p.slug,
      logoUrl: p.logoUrl ?? '',
      contactEmail: p.contactEmail ?? '',
      contactPhone: p.contactPhone ?? '',
      isActive: p.isActive,
      displayOrder: p.displayOrder,
    })
    setEditing(p)
    setUploadError(null)
    setCreating(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editing ? `/api/bank-partners/${editing.id}` : '/api/bank-partners'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          logoUrl: form.logoUrl.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          isActive: form.isActive,
          displayOrder: form.displayOrder,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error ?? 'Sauvegarde échouée')
      }
      setCreating(false)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/bank-partners/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Suppression échouée')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const toggleActive = async (p: BankPartner) => {
    try {
      await fetch(`/api/bank-partners/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      })
      await load()
    } catch { /* ignore */ }
  }

  // --- Upload logo (avec barre de progression via XMLHttpRequest) ---
  const handleLogoUpload = async (file: File) => {
    setUploadError(null)

    // Validation client : type
    const allowed = ['image/png', 'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      setUploadError(`Format non supporté : ${file.type || 'inconnu'}. Utilisez PNG, JPG, WebP, GIF ou ICO.`)
      return
    }
    // Validation client : taille
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`Fichier trop volumineux (${Math.round(file.size / 1024)} Ko). Maximum : 500 Ko.`)
      return
    }

    setUploading(true)
    setUploadProgress(0)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', 'logo')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/cms/upload')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      setUploading(false)
      setUploadProgress(null)
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          const url: string = json.data?.url ?? json.url
          if (url) {
            setForm((prev) => ({ ...prev, logoUrl: url }))
          } else {
            setUploadError('Réponse invalide du serveur (URL manquante)')
          }
        } else {
          setUploadError(json?.error ?? json?.message ?? `Upload échoué (${xhr.status})`)
        }
      } catch {
        setUploadError(`Réponse illisible du serveur (${xhr.status})`)
      }
    }

    xhr.onerror = () => {
      setUploading(false)
      setUploadProgress(null)
      setUploadError('Erreur réseau — le serveur est injoignable')
    }

    xhr.send(fd)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
          Les logos des banques partenaires défilent sur la page d&apos;accueil du site public.
        </p>
        <button className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" size={16} /> Ajouter une banque
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : list.length === 0 ? (
        <div className="card-grid-empty">
          Aucune banque partenaire. Cliquez sur « Ajouter une banque ».
        </div>
      ) : (
        <div className="bnk-grid">
          {list.map((p) => (
            <div key={p.id} className="bnk-card" style={{ opacity: p.isActive ? 1 : 0.55 }}>
              <div className="bnk-card-top">
                {p.logoUrl ? (
                  <img className="bnk-logo" src={p.logoUrl} alt={p.name} />
                ) : (
                  <div className="bnk-logo-placeholder">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="bnk-name">{p.name}</div>
                  <div className="bnk-slug">/{p.slug}</div>
                </div>
              </div>

              {(p.contactEmail || p.contactPhone || (p._count && p._count.rates > 0)) && (
                <div className="bnk-info">
                  {p._count && p._count.rates > 0 && <div>{p._count.rates} taux associés</div>}
                  {p.contactEmail && <div>{p.contactEmail}</div>}
                  {p.contactPhone && <div>{p.contactPhone}</div>}
                </div>
              )}

              <div className="bnk-footer">
                <span className={`bnk-status ${p.isActive ? 'bnk-status-active' : 'bnk-status-inactive'}`}>
                  {p.isActive ? 'Actif' : 'Inactif'}
                </span>
                <span className="bnk-order">Ordre #{p.displayOrder}</span>
                <div className="bnk-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)} title={p.isActive ? 'Désactiver' : 'Activer'}>
                    <Icon name={p.isActive ? 'check-circle' : 'x'} size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Modifier">
                    <Icon name="pencil" size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(p)} title="Supprimer" style={{ color: '#ef4444' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== MODAL CRÉATION / ÉDITION ===== */}
      <Modal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title={editing ? 'Modifier la banque' : 'Nouvelle banque partenaire'}
        wide
      >
        <div className="bp-form">
          {/* --- Section Identité --- */}
          <div className="bp-section">
            <div className="bp-section-title">
              <Icon name="building" size={15} />
              Identité
            </div>
            <div className="bp-row-2">
              <div className="bp-field">
                <label>Nom de la banque <span className="bp-req">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setForm((prev) => ({
                      ...prev,
                      name,
                      slug: editing ? prev.slug : name.toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, ''),
                    }))
                  }}
                  placeholder="Ex : Sparkasse"
                  autoFocus
                />
              </div>
              <div className="bp-field">
                <label>Slug <span className="bp-hint">(auto-généré, modifiable)</span></label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="sparkasse"
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>
            </div>
          </div>

          {/* --- Section Logo --- */}
          <div className="bp-section">
            <div className="bp-section-title">
              <Icon name="image" size={15} />
              Logo
            </div>

            {/* Erreur d'upload visible dans le modal */}
            {uploadError && (
              <div className="bp-upload-error">
                <Icon name="alert-triangle" size={14} />
                {uploadError}
              </div>
            )}

            {form.logoUrl ? (
              <div className="bp-logo-set">
                <div className="bp-logo-preview">
                  <img src={form.logoUrl} alt="Logo" onError={() => setUploadError('L\'image ne se charge pas. Vérifiez l\'URL ou re-uploadez le fichier.')} />
                </div>
                <div className="bp-logo-side">
                  <div className="bp-logo-url">{form.logoUrl}</div>
                  <div className="bp-logo-btns">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Icon name="upload" size={14} /> Changer
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setForm((prev) => ({ ...prev, logoUrl: '' })); setUploadError(null) }}
                    >
                      <Icon name="x" size={14} /> Retirer
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bp-logo-upload">
                <div
                  className={`bp-dropzone${dragOver ? ' drag' : ''}${uploading ? ' loading' : ''}`}
                  onClick={() => !uploading && logoInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const f = e.dataTransfer.files[0]
                    if (f) handleLogoUpload(f)
                  }}
                >
                  <div className="bp-dz-icon">
                    {uploading ? (
                      <span className="bp-spinner" />
                    ) : (
                      <Icon name="upload" size={28} />
                    )}
                  </div>
                  <div className="bp-dz-title">
                    {uploading
                      ? uploadProgress !== null && uploadProgress < 100
                        ? `Envoi… ${uploadProgress}%`
                        : 'Traitement…'
                      : 'Glisser le logo ici ou cliquer pour parcourir'}
                  </div>
                  {uploading && uploadProgress !== null && (
                    <div className="bp-progress-bar">
                      <div className="bp-progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                  <div className="bp-dz-sub">PNG · JPG · WebP · GIF · ICO — 500 Ko max — ~400×100px conseillé</div>
                </div>

                <div className="bp-or">
                  <span>OU</span>
                </div>

                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => { setForm({ ...form, logoUrl: e.target.value }); setUploadError(null) }}
                  placeholder="https://exemple.com/logo.png"
                  className="bp-url-input"
                />
              </div>
            )}

            <input
              ref={logoInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleLogoUpload(f)
                e.target.value = ''
              }}
            />
          </div>

          {/* --- Section Contact --- */}
          <div className="bp-section">
            <div className="bp-section-title">
              <Icon name="phone" size={15} />
              Contact <span className="bp-hint">(optionnel)</span>
            </div>
            <div className="bp-row-2">
              <div className="bp-field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  placeholder="contact@banque.fr"
                />
              </div>
              <div className="bp-field">
                <label>Téléphone</label>
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="+33 1 23 45 67 89"
                />
              </div>
            </div>
          </div>

          {/* --- Section Affichage --- */}
          <div className="bp-section">
            <div className="bp-section-title">
              <Icon name="eye" size={15} />
              Affichage
            </div>
            <div className="bp-row-2">
              <div className="bp-field" style={{ maxWidth: 140 }}>
                <label>Ordre d&apos;affichage</label>
                <input
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label className="bp-toggle">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  <span className="bp-toggle-track">
                    <span className="bp-toggle-thumb" />
                  </span>
                  <span className="bp-toggle-label">
                    {form.isActive ? 'Visible sur le site public' : 'Masqué'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* --- Actions --- */}
          <div className="bp-actions">
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer la banque'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer cette banque"
        message={`Supprimer définitivement « ${deleteTarget?.name ?? ''} » ? Les taux associés ne seront pas supprimés.`}
        confirmLabel="Supprimer"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
