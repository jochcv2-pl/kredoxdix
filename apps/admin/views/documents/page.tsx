'use client'

import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface DocTemplate {
  id: string
  name: string
  description: string | null
  filePath: string
  fileName: string
  level: number | null
  fields: string[]
  isActive: boolean
  createdAt: string
}

interface Lead {
  id: string
  firstName: string
  lastName: string
  email: string | null
}

const LEVEL_NAMES: Record<number, string> = {
  1: 'Niveau 1 — Accueil',
  2: 'Niveau 2 — Documents',
  3: 'Niveau 3 — Offre',
  4: 'Niveau 4 — Vérification',
  5: 'Niveau 5 — Accord',
  6: 'Niveau 6 — Signature',
  7: 'Niveau 7 — Déblocage',
}

const AVAILABLE_VARS = [
  'firstName', 'lastName', 'email', 'phone', 'city',
  'amount', 'annualRate', 'durationYears', 'monthlyPayment',
  'totalCost', 'loanType', 'date', 'siteName',
]

export default function Documents() {
  const [documents, setDocuments] = useState<DocTemplate[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showPreview, setShowPreview] = useState<DocTemplate | null>(null)
  const [previewLeadId, setPreviewLeadId] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocTemplate | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formLevel, setFormLevel] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // ---- Fetch ----
  const fetchDocs = async () => {
    try {
      const res = await fetch('/api/document-templates')
      const json = await res.json()
      const data = json.data ?? json
      if (Array.isArray(data)) setDocuments(data)
    } catch (e) {
      console.error('fetchDocs:', e)
    } finally {
      setLoading(false)
    }
  }

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads?limit=100')
      const json = await res.json()
      const data = json.data ?? json
      if (Array.isArray(data)) setLeads(data)
    } catch {
      // L'API leads peut ne pas exister encore, ignorer
    }
  }

  useEffect(() => { fetchDocs(); fetchLeads() }, [])

  // ---- Upload ----
  async function handleUpload() {
    if (!selectedFile || !formName) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('name', formName)
      if (formDesc) formData.append('description', formDesc)
      if (formLevel) formData.append('level', formLevel)

      const res = await fetch('/api/document-templates/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        await fetchDocs()
        setShowUpload(false)
        setFormName(''); setFormDesc(''); setFormLevel(''); setSelectedFile(null)
      }
    } catch (e) {
      console.error('upload:', e)
    } finally {
      setUploading(false)
    }
  }

  // ---- Delete ----
  async function handleDelete(id: string) {
    try {
      await fetch(`/api/document-templates/${id}`, { method: 'DELETE' })
      await fetchDocs()
    } catch (e) {
      console.error('delete:', e)
    }
  }

  // ---- Toggle active ----
  async function toggleActive(doc: DocTemplate) {
    try {
      await fetch(`/api/document-templates/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !doc.isActive }),
      })
      await fetchDocs()
    } catch (e) {
      console.error('toggle:', e)
    }
  }

  // ---- Preview ----
  async function handlePreview() {
    if (!showPreview || !previewLeadId) return
    setPreviewLoading(true)
    setPreviewUrl(null)
    try {
      const res = await fetch(`/api/document-templates/${showPreview.id}/fill-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: previewLeadId }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      }
    } catch (e) {
      console.error('preview:', e)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <section className="view" id="documents">
      <style>{`
        .doc-info-banner {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          padding: 16px 20px;
          margin-bottom: 20px;
        }
        .doc-info-banner h4 {
          font-size: 14px;
          font-weight: 700;
          color: var(--blue-deep);
          margin-bottom: 8px;
        }
        .doc-info-banner ol {
          font-size: 13px;
          color: var(--text);
          line-height: 1.8;
          padding-left: 20px;
        }
        .doc-vars {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .doc-var-chip {
          display: inline-block;
          padding: 2px 8px;
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
          color: var(--blue-deep);
        }
        .doc-card {
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px 18px;
          margin-bottom: 12px;
        }
        .doc-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }
        .doc-card-name { font-size: 15px; font-weight: 700; color: var(--text); }
        .doc-card-desc { font-size: 12px; color: var(--slate); margin-top: 2px; }
        .doc-card-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .doc-fields {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 8px;
        }
        .doc-field-chip {
          padding: 2px 7px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
          color: #15803d;
        }
        .doc-fields-empty {
          font-size: 12px;
          color: var(--orange);
          font-style: italic;
        }
        .doc-level-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          background: var(--bg);
          color: var(--slate);
        }
        .doc-upload-zone {
          border: 2px dashed var(--border);
          border-radius: 8px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .doc-upload-zone:hover { border-color: var(--blue-deep); background: #f8fafc; }
        .doc-upload-zone.has-file { border-color: var(--green); background: #f0fdf4; }
        .doc-empty { text-align: center; padding: 40px; color: var(--slate); }
      `}</style>

      {/* Info banner */}
      <div className="doc-info-banner">
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="clipboard" size={18} /> Comment fonctionne le système de documents PDF ?</h4>
        <ol>
          <li>Créez votre document dans Word, LibreOffice ou tout autre éditeur</li>
          <li>Aux endroits où les données du client doivent apparaître, insérez des <b>champs de formulaire texte</b> (AcroForm)</li>
          <li>Nommez chaque champ selon les variables ci-dessous</li>
          <li>Exportez en <b>PDF avec champs de formulaire actifs</b></li>
          <li>Uploadez le PDF ici — le système détecte automatiquement les champs</li>
          <li>Associez le document à un niveau — il sera envoyé automatiquement avec l'email du niveau</li>
        </ol>
        <div className="doc-vars">
          {AVAILABLE_VARS.map(v => (
            <span key={v} className="doc-var-chip">{`{${v}}`}</span>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="panel">
        <div className="panel-head">
          <h3>
            Documents modèles
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--slate)', marginLeft: 8 }}>
              {documents.length} document{documents.length > 1 ? 's' : ''}
            </span>
          </h3>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            + Ajouter un document
          </button>
        </div>
        <div className="panel-body" style={{ paddingTop: 16 }}>
          {loading ? (
            <div className="doc-empty">Chargement…</div>
          ) : documents.length === 0 ? (
            <div className="doc-empty">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Aucun document modèle</div>
              <div style={{ fontSize: 13 }}>Ajoutez votre premier PDF à champs remplissables.</div>
            </div>
          ) : (
            documents.map((doc) => (
              <div className="doc-card" key={doc.id}>
                <div className="doc-card-top">
                  <div>
                    <div className="doc-card-name">{doc.name}</div>
                    {doc.description && (
                      <div className="doc-card-desc">{doc.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      {doc.level !== null ? (
                        <span className="badge b-progress">
                          {LEVEL_NAMES[doc.level] ?? `Niveau ${doc.level}`}
                        </span>
                      ) : (
                        <span className="badge b-wait">Tous niveaux</span>
                      )}
                      <span className={`badge ${doc.isActive ? 'b-client' : 'b-lost'}`}>
                        {doc.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                  </div>
                  <div className="doc-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(doc)}>
                      {doc.isActive ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowPreview(doc); setPreviewLeadId(leads[0]?.id ?? ''); setPreviewUrl(null) }}
                    >
                      Aperçu
                    </button>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/${doc.filePath}`}
                      download={doc.fileName}
                    >
                      Télécharger
                    </a>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)' }}
                      onClick={() => setDeleteTarget(doc)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                {(doc.fields?.length ?? 0) > 0 ? (
                  <div className="doc-fields">
                    {doc.fields.map((f, i) => (
                      <span key={i} className="doc-field-chip">{f}</span>
                    ))}
                  </div>
                ) : (
                  <div className="doc-fields-empty">
                    ⚠ Aucun champ AcroForm détecté — ce PDF sera envoyé tel quel sans personnalisation.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Upload modal */}
      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Ajouter un document modèle">
        <div className="modal-fg">
          <label>Nom du document</label>
          <input
            type="text"
            placeholder="Ex : Offre de prêt formelle"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
        </div>

        <div className="modal-fg">
          <label>Description (optionnel)</label>
          <input
            type="text"
            placeholder="Description courte du document"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
          />
        </div>

        <div className="modal-fg">
          <label>Niveau associé</label>
          <select value={formLevel} onChange={(e) => setFormLevel(e.target.value)}>
            <option value="">Tous niveaux (disponible partout)</option>
            {[1, 2, 3, 4, 5, 6, 7].map(l => (
              <option key={l} value={String(l)}>{LEVEL_NAMES[l]}</option>
            ))}
          </select>
        </div>

        <div className="modal-fg">
          <label>Fichier PDF</label>
          <div
            className={`doc-upload-zone${selectedFile ? ' has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="check-circle" size={16} /> {selectedFile.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 4 }}>
                  {(selectedFile.size / 1024).toFixed(0)} Ko — Cliquez pour changer
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="file-text" size={16} /> Cliquez pour sélectionner un PDF
                </div>
                <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 4 }}>
                  Le PDF doit contenir des champs AcroForm pour la personnalisation automatique
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!formName.trim() || !selectedFile || uploading}
          >
            {uploading ? 'Upload…' : 'Uploader'}
          </button>
        </div>
      </Modal>

      {/* Preview modal */}
      <Modal
        isOpen={!!showPreview}
        onClose={() => { setShowPreview(null); setPreviewUrl(null) }}
        title={`Aperçu — ${showPreview?.name ?? ''}`}
      >
        <div className="modal-fg">
          <label>Sélectionnez un prospect/client pour l'aperçu</label>
          <select value={previewLeadId} onChange={(e) => { setPreviewLeadId(e.target.value); setPreviewUrl(null) }}>
            <option value="">— Choisir —</option>
            {leads.map(l => (
              <option key={l.id} value={l.id}>{l.firstName} {l.lastName} ({l.email || 'pas d\'email'})</option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={!previewLeadId || previewLoading}
          >
            {previewLoading ? 'Génération…' : 'Générer l\'aperçu'}
          </button>
        </div>

        {previewUrl && (
          <div style={{ marginTop: 16 }}>
            <embed src={previewUrl} type="application/pdf" width="100%" height="500px" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <a className="btn btn-ghost btn-sm" href={previewUrl} download="apercu.pdf">
                Télécharger l'aperçu
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer le document"
        message={<>Voulez-vous vraiment supprimer <strong>{deleteTarget?.name}</strong> ? Le fichier PDF sera définitivement supprimé.</>}
        confirmLabel="Supprimer"
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id) }}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  )
}
