'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
import { EmailFooter, type EmailFooterData, DEFAULT_FOOTER } from '@/components/EmailFooter';
import { EmailHeader } from '@/components/EmailHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// =============================================================================
// Types & constantes
// =============================================================================

type Sub = 'generer' | 'liste';
type Mode = 'visuel' | 'import';
type PreviewMode = 'data' | 'raw';

// Déclencheurs autorisés (enum EmailTrigger côté DB).
// La liste est volontairement restreinte aux slots réellement éditables
// depuis l'admin (reception_ack, offer, relance_1..3, manual). Les level_1..7
// sont pilotés côté app et non exposés ici pour éviter la confusion.
const TRIGGERS: Array<{ value: string; label: string }> = [
  { value: 'reception_ack', label: 'Accusé de réception · Agent Accueil' },
  { value: 'offer', label: 'Offre formalisée · Agent Offre' },
  { value: 'relance_1', label: 'Relance J+3 · Agent Relance' },
  { value: 'relance_2', label: 'Relance J+6 · Agent Relance' },
  { value: 'relance_3', label: 'Relance J+9 · Agent Relance' },
  { value: 'manual', label: 'Envoi manuel · —' },
];

const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
  TRIGGERS.map((t) => [t.value, t.label]),
);

const VARS = [
  '{{Prénom}}', '{{Nom}}', '{{Ville}}', '{{Type de crédit}}', '{{Montant}}',
  '{{Taux}}', '{{Mensualité}}', '{{Durée}}', '{{Date}}', '{{Date validité}}',
  '{{Situation}}', '{{Prénom du courtier}}',
];

const SAMPLE: Record<string, string> = {
  '{{Prénom}}': 'Marie', '{{Nom}}': 'Lefèvre', '{{Ville}}': 'Lyon',
  '{{Type de crédit}}': 'prêt immobilier', '{{Montant}}': '210 000 €',
  '{{Taux}}': '2,0', '{{Mensualité}}': '1 062 €', '{{Durée}}': '20 ans',
  '{{Date}}': '15 juillet 2026', '{{Date validité}}': '15 août 2026',
  '{{Situation}}': 'Salarié CDI', '{{Prénom du courtier}}': 'Thomas',
};

const DEFAULT_BODY = `Bonjour {{Prénom}},

Nous avons bien reçu votre demande de {{Type de crédit}} d'un montant de {{Montant}}. Votre courtier {{Prénom du courtier}} étudie votre profil et vous rappelle sous 24 heures.

À très bientôt,
{{Prénom du courtier}} — Courtier senior, Kredix`;

const VAR_RE = /\{\{[^}]+\}\}/g;

// =============================================================================
// Helpers
// =============================================================================

function renderFilled(text: string, mode: PreviewMode) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const v = m[0];
    const val = mode === 'data' ? SAMPLE[v] ?? v : v;
    out.push(<span className="hl" key={key++}>{val}</span>);
    last = m.index + v.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function detectVars(html: string): string[] {
  return Array.from(new Set(html.match(VAR_RE) ?? []));
}

function extractBodyContent(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

type IframeRenderMode = 'composed' | 'raw';

function buildComposedEmailDoc(body: string, opts: {
  bannerVisible: boolean;
  footer: EmailFooterData;
}): string {
  const banner = opts.bannerVisible
    ? `<div style="width:100%;background:#0F2942;"><img src="/email-banner.jpg" alt="Kredix" style="width:100%;max-height:140px;object-fit:cover;display:block;" /></div>`
    : '';
  const f = opts.footer;
  const footer = `
  <div style="background:#0F2942;color:rgba(255,255,255,0.7);padding:20px 18px;font-family:'Montserrat',Arial,sans-serif;font-size:11px;line-height:1.7;">
    <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:10px;letter-spacing:-0.01em;">${f.brand}<span style="color:#F97316;">${f.brandAccent}</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 20px;margin-bottom:10px;font-size:11px;color:rgba(255,255,255,0.6);">
      <span>${f.phone}</span><span>${f.email}</span><span>${f.orias}</span>
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,0.4);line-height:1.6;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
      ${f.legal}<br />
      <a style="color:#2B8BDE;text-decoration:none;">${f.link1}</a> ·
      <a style="color:#2B8BDE;text-decoration:none;">${f.link2}</a> ·
      <a style="color:#2B8BDE;text-decoration:none;">${f.link3}</a>
    </div>
  </div>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;font-family:'Montserrat',Arial,sans-serif;">
  ${banner}
  <div style="padding:24px 22px;font-size:14px;line-height:1.7;color:#0F172A;">${body}</div>
  ${footer}
</body></html>`;
}

// =============================================================================
// Template — aligné sur le modèle Prisma EmailTemplate
// =============================================================================

interface Template {
  id: string;
  name: string;
  trigger: string;
  language: string;
  agentId: string | null;
  status: 'active' | 'draft';
  subject: string;
  bodyText: string;
  htmlContent: string | null;
  bannerEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'pt', label: '🇵🇹 Português' },
  { value: 'it', label: '🇮🇹 Italiano' },
];

// =============================================================================
// Composant principal
// =============================================================================

export default function Emails() {
  const [activeSub, setActiveSub] = useState<Sub>('generer');
  const [activeMode, setActiveMode] = useState<Mode>('visuel');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('data');

  // Champs du formulaire de création (mode visuel).
  const [nameInput, setNameInput] = useState('Confirmation de demande');
  const [triggerInput, setTriggerInput] = useState<string>('reception_ack');
  const [languageInput, setLanguageInput] = useState<string>('fr');
  const [subjInput, setSubjInput] = useState('Votre dossier a bien été reçu, {{Prénom}}');
  const [bodyInput, setBodyInput] = useState(DEFAULT_BODY);
  const [bannerVisible, setBannerVisible] = useState(true);

  // Mode import HTML.
  const [htmlArea, setHtmlArea] = useState('');
  const [importName, setImportName] = useState('');
  const [importTrigger, setImportTrigger] = useState<string>('reception_ack');
  const [importLanguage, setImportLanguage] = useState<string>('fr');
  const [dzFile, setDzFile] = useState('');
  const [dragging, setDragging] = useState(false);

  // Footer (toujours éditable, mais stocké séparément — pas encore persisté en DB).
  const [footerData, setFooterData] = useState<EmailFooterData>(DEFAULT_FOOTER);

  // Liste des templates.
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [fullIframeOpen, setFullIframeOpen] = useState(false);
  const [iframeRenderMode, setIframeRenderMode] = useState<IframeRenderMode>('composed');
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Chargement initial — GET /api/templates
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    ;(async () => {
      try {
        const res = await fetch('/api/templates');
        if (!res.ok) throw new Error('Échec chargement templates');
        const json = await res.json();
        if (cancelled) return;
        setTemplates(json.data ?? json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })()
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers UI
  // ---------------------------------------------------------------------------

  function insertVar(v: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = bodyInput.slice(0, s) + v + bodyInput.slice(e);
    setBodyInput(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + v.length;
    });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setDzFile(file.name);
    const name = file.name.replace(/\.(html?|htm)$/i, '').replace(/[-_]/g, ' ');
    setImportName((cur) => cur || name.charAt(0).toUpperCase() + name.slice(1));
    const reader = new FileReader();
    reader.onload = (ev) => { setHtmlArea(String(ev.target?.result ?? '')); };
    reader.readAsText(file);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) { handleFile(e.target.files?.[0]); }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  }

  const detected = htmlArea.trim() ? detectVars(htmlArea) : [];
  const importSrcDoc = htmlArea.trim()
    ? Object.keys(SAMPLE).reduce((acc, v) => acc.split(v).join(SAMPLE[v]), htmlArea)
    : '';

  const composedIframeDoc = htmlArea.trim()
    ? buildComposedEmailDoc(
        extractBodyContent(
          Object.keys(SAMPLE).reduce((acc, v) => acc.split(v).join(SAMPLE[v]), htmlArea),
        ),
        { bannerVisible, footer: footerData },
      )
    : '';

  const fullscreenIframeDoc = iframeRenderMode === 'composed' ? composedIframeDoc : importSrcDoc;

  // ---------------------------------------------------------------------------
  // Actions API
  // ---------------------------------------------------------------------------

  // Crée un template (POST /api/templates) depuis le mode visuel.
  const saveTemplate = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: nameInput.trim() || 'Nouveau modèle',
        trigger: triggerInput,
        language: languageInput,
        status: 'active' as const,
        subject: subjInput,
        bodyText: bodyInput,
        htmlContent: null,
        bannerEnabled: bannerVisible,
      };
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `Échec création (${res.status})`);
      }
      const created: Template = (await res.json()).data ?? (await res.json());
      setTemplates((prev) => [created, ...prev]);
      setSaveModalOpen(false);
      setActiveSub('liste');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  // Importe un template HTML (POST /api/templates avec htmlContent).
  const importTemplate = async () => {
    if (!htmlArea.trim()) {
      setError('Aucun contenu HTML à importer.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: importName.trim() || 'Modèle importé',
        trigger: importTrigger,
        language: importLanguage,
        status: 'draft' as const,
        subject: importName.trim() || 'Modèle importé',
        bodyText: extractBodyContent(htmlArea).replace(/<[^>]+>/g, ' ').trim().slice(0, 500),
        htmlContent: htmlArea,
        bannerEnabled: bannerVisible,
      };
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `Échec import (${res.status})`);
      }
      const created: Template = (await res.json()).data ?? (await res.json());
      setTemplates((prev) => [created, ...prev]);
      // Reset formulaire import.
      setHtmlArea(''); setDzFile(''); setImportName('');
      setActiveSub('liste');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  // Bascule le statut d'un template (PATCH /api/templates/[id]).
  // Le serveur désactive automatiquement les autres actifs du même trigger.
  const toggleTemplateStatus = async (tpl: Template) => {
    setError(null);
    const next = tpl.status === 'active' ? 'draft' : 'active';
    try {
      const res = await fetch(`/api/templates/${tpl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? 'Échec bascule statut');
      }
      const updated: Template = (await res.json()).data ?? (await res.json());
      setTemplates((prev) => {
        // Si activation, désactive localement les autres du même trigger (miroir serveur).
        if (next === 'active') {
          return prev.map((t) =>
            t.id === updated.id
              ? updated
              : t.trigger === updated.trigger && t.language === updated.language && t.status === 'active'
                ? { ...t, status: 'draft' as const }
                : t,
          );
        }
        return prev.map((t) => (t.id === updated.id ? updated : t));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  };

  // Supprime un template (DELETE /api/templates/[id]).
  const deleteTemplate = async (tpl: Template) => {
    setError(null);
    try {
      const res = await fetch(`/api/templates/${tpl.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Échec suppression');
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="view" id="emails">
      {error && (
        <div className="info-band" style={{ background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div className="imark" style={{ background: '#fecaca', color: '#991b1b' }}>!</div>
          <div>{error}</div>
        </div>
      )}

      <div className="submenus">
        <div className={`submenu${activeSub === 'generer' ? ' active' : ''}`} onClick={() => setActiveSub('generer')}>
          Générer un nouveau modèle
        </div>
        <div className={`submenu${activeSub === 'liste' ? ' active' : ''}`} onClick={() => setActiveSub('liste')}>
          Modèles disponibles {templates.length > 0 && `(${templates.length})`}
        </div>
      </div>

      {activeSub === 'generer' && (
        <div className="subview active" id="generer">
          <div className="info-band">
            <div className="imark">i</div>
            <div>
              Créez un modèle une fois avec des <b>variables</b> comme <code>{'{{Prénom}}'}</code>. À chaque envoi,
              l&apos;agent les remplace par les données réelles du client. Vous pouvez aussi importer un fichier HTML
              existant.
            </div>
          </div>
          <div className="mode-switch">
            <button className={`mode-btn${activeMode === 'visuel' ? ' active' : ''}`} onClick={() => setActiveMode('visuel')}>
              Éditeur visuel
            </button>
            <button className={`mode-btn${activeMode === 'import' ? ' active' : ''}`} onClick={() => setActiveMode('import')}>
              Importer un fichier HTML
            </button>
          </div>

          {/* ===== MODE VISUEL ===== */}
          {activeMode === 'visuel' && (
            <div className="editor-grid" id="modeVisuel">
              <div>
                <div className="sub-panel">
                  <h4>Paramètres du modèle</h4>
                  <div className="frow">
                    <div className="fg">
                      <label>Nom du modèle</label>
                      <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                    </div>
                    <div className="fg">
                      <label>Déclencheur</label>
                      <select value={triggerInput} onChange={(e) => setTriggerInput(e.target.value)}>
                        {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="fg">
                      <label>Langue</label>
                      <select value={languageInput} onChange={(e) => setLanguageInput(e.target.value)}>
                        {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>
                    <div className="fg full">
                      <label>Objet de l&apos;email</label>
                      <input value={subjInput} onChange={(e) => setSubjInput(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="sub-panel">
                  <h4>Corps du message</h4>
                  <textarea className="body-editor" ref={bodyRef} value={bodyInput} onChange={(e) => setBodyInput(e.target.value)} />
                  <p className="var-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                    <b>Pied de page prédéfini :</b> un bloc signature Kredix (coordonnées, mentions légales ORIAS, liens
                    de désinscription) est <b>ajouté automatiquement</b> à chaque envoi. Vous n&apos;avez pas à le saisir.
                  </p>
                  <div className="email-banner-toggle-row">
                    <label>
                      <input type="checkbox" checked={bannerVisible} onChange={(e) => setBannerVisible(e.target.checked)} />
                      Bannière d&apos;en-tête Kredix (image)
                    </label>
                  </div>
                </div>
                <div className="sub-panel">
                  <h4>Pied de page (aperçu uniquement)</h4>
                  <p className="var-hint">Ces informations apparaissent en bas de chaque email envoyé. Modifiez-les librement pour l&apos;aperçu (la persistance du pied de page global est à venir).</p>
                  <div className="frow">
                    <div className="fg"><label>Nom de la marque</label><input value={footerData.brand} onChange={(e) => setFooterData({ ...footerData, brand: e.target.value })} /></div>
                    <div className="fg"><label>Accent de couleur (lettre)</label><input value={footerData.brandAccent} onChange={(e) => setFooterData({ ...footerData, brandAccent: e.target.value })} /></div>
                    <div className="fg"><label>Téléphone</label><input value={footerData.phone} onChange={(e) => setFooterData({ ...footerData, phone: e.target.value })} /></div>
                    <div className="fg"><label>Email</label><input value={footerData.email} onChange={(e) => setFooterData({ ...footerData, email: e.target.value })} /></div>
                    <div className="fg"><label>ORIAS / Agrément</label><input value={footerData.orias} onChange={(e) => setFooterData({ ...footerData, orias: e.target.value })} /></div>
                    <div className="fg"><label>Lien 1</label><input value={footerData.link1} onChange={(e) => setFooterData({ ...footerData, link1: e.target.value })} /></div>
                    <div className="fg"><label>Lien 2</label><input value={footerData.link2} onChange={(e) => setFooterData({ ...footerData, link2: e.target.value })} /></div>
                    <div className="fg"><label>Lien 3</label><input value={footerData.link3} onChange={(e) => setFooterData({ ...footerData, link3: e.target.value })} /></div>
                  </div>
                  <div className="fg" style={{ marginTop: 10 }}>
                    <label>Mentions légales</label>
                    <textarea className="body-editor" style={{ minHeight: 80 }} value={footerData.legal} onChange={(e) => setFooterData({ ...footerData, legal: e.target.value })} />
                  </div>
                </div>
                <div className="sub-panel">
                  <h4>Insérer une variable</h4>
                  <p className="var-hint">Cliquez pour insérer dans le corps. L&apos;agent remplacera par la donnée réelle à l&apos;envoi.</p>
                  <div className="var-chips">
                    {VARS.map((v) => <span className="chip" key={v} onClick={() => insertVar(v)}>{v}</span>)}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setSaveModalOpen(true)} disabled={saving}>
                  Enregistrer le modèle
                </button>
              </div>

              {/* PREVIEW avec bouton œil */}
              <div className="preview">
                <div className="pv-head">
                  <div className="pv-head-info">
                    <div className="pv-from">De : expediteur@votredomaine.com</div>
                    <div className="pv-subj">{renderFilled(subjInput, previewMode)}</div>
                  </div>
                  <button className="pv-expand-btn" title="Aperçu plein écran" onClick={() => setFullPreviewOpen(true)}>
                    <Icon name="search" size={18} />
                  </button>
                </div>
                <div className="pv-body">
                  <EmailHeader bannerVisible={bannerVisible} onRemoveBanner={() => setBannerVisible(false)} />
                  {renderFilled(bodyInput, previewMode)}
                  <EmailFooter data={footerData} />
                </div>
                <div className="pv-toggle">
                  <span>Aperçu :</span>
                  <span className={`pv-lang${previewMode === 'data' ? ' active' : ''}`} onClick={() => setPreviewMode('data')}>Données réelles</span>
                  <span className={`pv-lang${previewMode === 'raw' ? ' active' : ''}`} onClick={() => setPreviewMode('raw')}>Variables</span>
                </div>
              </div>
            </div>
          )}

          {/* ===== MODE IMPORT ===== */}
          {activeMode === 'import' && (
            <div className="import-grid" id="modeImport">
              <div>
                <div className="sub-panel">
                  <h4>Importer un modèle HTML</h4>
                  <div
                    className={`dropzone${dragging ? ' drag' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                    onDrop={onDrop}
                  >
                    <svg className="dz-ico" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
                    </svg>
                    <div className="dz-title">Déposez votre fichier .html ici</div>
                    <div className="dz-sub">ou cliquez pour parcourir</div>
                    {dzFile && <div className="dz-file"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={16} /> {dzFile}</span></div>}
                  </div>
                  <input type="file" ref={fileInputRef} accept=".html,.htm,text/html" style={{ display: 'none' }} onChange={onFileChange} />
                  <div className="or-line"><span>ou collez le code HTML</span></div>
                  <textarea className="html-area" placeholder="<html><body>Bonjour {{Prénom}}…</body></html>" value={htmlArea} onChange={(e) => setHtmlArea(e.target.value)} />
                  {detected.length > 0 && (
                    <div className="detected">
                      <h4>Variables détectées</h4>
                      <p className="dh">Trouvées dans le HTML. L&apos;agent les remplacera à chaque envoi.</p>
                      <div className="var-chips">{detected.map((v) => <span className="chip" key={v}>{v}</span>)}</div>
                    </div>
                  )}
                </div>
                <div className="frow">
                  <div className="fg">
                    <label>Nom du modèle importé</label>
                    <input value={importName} placeholder="Ex : Confirmation de demande" onChange={(e) => setImportName(e.target.value)} />
                  </div>
                  <div className="fg">
                    <label>Déclencheur</label>
                    <select value={importTrigger} onChange={(e) => setImportTrigger(e.target.value)}>
                      {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label>Langue</label>
                    <select value={importLanguage} onChange={(e) => setImportLanguage(e.target.value)}>
                      {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={importTemplate} disabled={saving}>
                  {saving ? 'Import…' : 'Importer comme modèle'}
                </button>
              </div>

              {/* IFRAME PREVIEW */}
              <div className="iframe-wrap">
                <div className="ifh">
                  <span>Aperçu du rendu</span>
                  {importSrcDoc && (
                    <button className="pv-expand-btn" title="Aperçu plein écran" onClick={() => setFullIframeOpen(true)}>
                      <Icon name="search" size={18} />
                    </button>
                  )}
                </div>
                {importSrcDoc ? (
                  <iframe srcDoc={importSrcDoc} title="Aperçu" />
                ) : (
                  <div className="iframe-empty">Importez ou collez du HTML pour voir l&apos;aperçu.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSub === 'liste' && (
        <div className="subview active" id="liste">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--slate)' }}>
              {loading
                ? 'Chargement…'
                : `${templates.length} modèle${templates.length > 1 ? 's' : ''} · utilisés automatiquement par les agents à chaque envoi`}
            </div>
            <button className="btn btn-primary" onClick={() => setActiveSub('generer')}>+ Nouveau modèle</button>
          </div>
          <div className="tpl-grid">
            {templates.map((tpl) => (
              <div className="tpl-card" key={tpl.id}>
                <div className="tpl-top">
                  <div>
                    <div className="tpl-name">{tpl.name}</div>
                    <div className="tpl-trigger">{TRIGGER_LABEL[tpl.trigger] ?? tpl.trigger}</div>
                  </div>
                  <button
                    className={`badge ${tpl.status === 'active' ? 'b-offer' : 'b-wait'}`}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => toggleTemplateStatus(tpl)}
                    title={tpl.status === 'active' ? 'Cliquer pour passer en brouillon' : 'Cliquer pour activer (désactive les autres du même déclencheur)'}
                  >
                    {tpl.status === 'active' ? 'Actif' : 'Brouillon'}
                  </button>
                </div>
                <div className="tpl-lang-row">
                  <span className="lang-tag">{(tpl.language || 'fr').toUpperCase()}</span>
                </div>
                <div className="tpl-excerpt">{tpl.bodyText?.slice(0, 160) ?? '—'}{(tpl.bodyText?.length ?? 0) > 160 ? '…' : ''}</div>
                <div className="tpl-meta">
                  <div className="tpl-vars">
                    {(detectVars(tpl.bodyText ?? '')).slice(0, 5).map((v) => <span className="tpl-var" key={v}>{v}</span>)}
                  </div>
                  <div className="tpl-actions">
                    <button className="tpl-delete" onClick={() => setDeleteTarget(tpl)}>Supprimer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MODAL SAVE ===== */}
      <Modal isOpen={saveModalOpen} onClose={() => setSaveModalOpen(false)} title="Enregistrer le modèle">
        <p className="field-hint">
          Le modèle sera sauvegardé et activé. S&apos;il existe déjà un template actif pour le même déclencheur, il sera passé en brouillon.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
          <b>Modèle :</b> {nameInput}<br />
          <b>Déclencheur :</b> {TRIGGER_LABEL[triggerInput] ?? triggerInput}<br />
          <b>Statut :</b> Actif
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setSaveModalOpen(false)} disabled={saving}>Annuler</button>
          <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Confirmer l\'enregistrement'}
          </button>
        </div>
      </Modal>

      {/* ===== FULLSCREEN PREVIEW (éditeur visuel) ===== */}
      <Modal isOpen={fullPreviewOpen} onClose={() => setFullPreviewOpen(false)} title="Aperçu plein écran — Modèle d'email">
        <div className="fs-preview-head">
          <div className="pv-from">De : expediteur@votredomaine.com</div>
          <div className="pv-subj">{renderFilled(subjInput, previewMode)}</div>
        </div>
        <div className="fs-preview-body">
          <EmailHeader bannerVisible={bannerVisible} />
          {renderFilled(bodyInput, previewMode)}
          <EmailFooter data={footerData} />
        </div>
        <div className="modal-actions">
          <span className="pv-lang" style={{ marginLeft: 0, cursor: 'pointer' }} onClick={() => setPreviewMode(previewMode === 'data' ? 'raw' : 'data')}>
            Basculer : {previewMode === 'data' ? 'Variables' : 'Données réelles'}
          </span>
          <button className="btn btn-primary" onClick={() => setFullPreviewOpen(false)}>Fermer</button>
        </div>
      </Modal>

      {/* ===== FULLSCREEN IFRAME (mode import) ===== */}
      <Modal isOpen={fullIframeOpen} onClose={() => setFullIframeOpen(false)} title="Aperçu plein écran — Rendu HTML">
        <div className="fs-iframe-toolbar">
          <div className="pv-toggle" style={{ margin: 0 }}>
            <span>Aperçu :</span>
            <span
              className={`pv-lang${iframeRenderMode === 'composed' ? ' active' : ''}`}
              onClick={() => setIframeRenderMode('composed')}
            >Email envoyé</span>
            <span
              className={`pv-lang${iframeRenderMode === 'raw' ? ' active' : ''}`}
              onClick={() => setIframeRenderMode('raw')}
            >HTML brut</span>
          </div>
          {iframeRenderMode === 'composed' && !bannerVisible && (
            <span className="fs-iframe-note" style={{ fontSize: 11, color: 'var(--slate-light)' }}>
              Bannière désactivée
            </span>
          )}
        </div>
        {fullscreenIframeDoc && (
          <iframe srcDoc={fullscreenIframeDoc} title="Aperçu plein écran" className="fs-iframe" />
        )}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => setFullIframeOpen(false)}>Fermer</button>
        </div>
      </Modal>

      {/* ===== DELETE CONFIRMATION ===== */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Supprimer le modèle"
        message={
          <>
            Voulez-vous vraiment supprimer <strong>{deleteTarget?.name}</strong> ? Cette action est irréversible. Le modèle ne sera plus utilisé par les agents.
          </>
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={() => { if (deleteTarget) deleteTemplate(deleteTarget); }}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
}
