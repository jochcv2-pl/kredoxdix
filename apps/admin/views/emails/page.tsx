'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
import { EmailFooter, type EmailFooterData, DEFAULT_FOOTER } from '@/components/EmailFooter';
import { EmailHeader } from '@/components/EmailHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmailBlockEditor } from '@/components/email-editor/EmailBlockEditor';
import {
  type EmailBlock,
  blocksToFullHtml,
  blocksToText,
} from '@/lib/email-blocks';

// =============================================================================
// Types & constantes
// =============================================================================

type Sub = 'generer' | 'liste' | 'blocs';
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

// Variables disponibles — alignées EXACTEMENT sur interpolateTemplate()
// (@kredix/email/template.ts). Toute variable absente de l'interpolateur ne
// serait jamais remplacée et resterait visible dans l'email envoyé.
const VARS: Array<{ value: string; group: string }> = [
  // Prospect (données du lead)
  { value: '{{Prénom}}', group: 'Prospect' },
  { value: '{{Nom}}', group: 'Prospect' },
  { value: '{{Email}}', group: 'Prospect' },
  { value: '{{Téléphone}}', group: 'Prospect' },
  { value: '{{TypePrêt}}', group: 'Prospect' },
  { value: '{{Montant}}', group: 'Prospect' },
  { value: '{{Durée}}', group: 'Prospect' },
  { value: '{{Mensualité}}', group: 'Prospect' },
  { value: '{{TAEG}}', group: 'Prospect' },
  { value: '{{Message}}', group: 'Prospect' },
  { value: '{{LienDesinscription}}', group: 'Prospect' },
  // Marque (données du site / agence)
  { value: '{{NomSite}}', group: 'Marque' },
  { value: '{{SiteUrl}}', group: 'Marque' },
  { value: '{{LogoUrl}}', group: 'Marque' },
  { value: '{{ContactEmail}}', group: 'Marque' },
  { value: '{{TéléphoneAgence}}', group: 'Marque' },
  { value: '{{AdresseAgence}}', group: 'Marque' },
];

const SAMPLE: Record<string, string> = {
  '{{Prénom}}': 'Marie',
  '{{Nom}}': 'Lefèvre',
  '{{Email}}': 'marie.lefevre@email.fr',
  '{{Téléphone}}': '06 12 34 56 78',
  '{{TypePrêt}}': 'immobilier',
  '{{Montant}}': '210 000 €',
  '{{Durée}}': '20 ans',
  '{{Mensualité}}': '1 062 €/mois',
  '{{TAEG}}': '2,00 %',
  '{{Message}}': 'Votre dossier est complet.',
  '{{LienDesinscription}}': 'https://kredix.fr/api/unsubscribe?t=...',
  '{{NomSite}}': 'Kredix',
  '{{SiteUrl}}': 'https://kredix.fr',
  '{{LogoUrl}}': 'https://kredix.fr/logo.png',
  '{{ContactEmail}}': 'contact@kredix.fr',
  '{{TéléphoneAgence}}': '01 23 45 67 89',
  '{{AdresseAgence}}': '12 rue de la Finance, 75001 Paris',
};

const DEFAULT_BODY = `Bonjour {{Prénom}},

Nous avons bien reçu votre demande de prêt {{TypePrêt}} d'un montant de {{Montant}}. Notre équipe étudie votre profil et vous recontacte sous 24 heures.

À très bientôt,
L'équipe {{NomSite}}`;

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

// Détecte un document HTML complet (template importé ou éditeur de blocs).
// Même logique que composeEmailHtml côté serveur (@kredix/email/layout.ts).
const FULL_DOC_RE = /<(!doctype\s+html|html[\s>]|body[\s>])/i;
function isFullHtmlDocument(html: string): boolean {
  return FULL_DOC_RE.test(html);
}

// Pied de page désinscription RGPD injecté dans l'aperçu des documents complets.
// Reflète ce que le client recevra réellement (composeEmailHtml côté serveur).
const PREVIEW_UNSUB_FOOTER = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;padding:18px 24px;border-top:1px solid #e5e7eb;background:#fafbfc;">
  <tr><td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6;">
    <div>© ${new Date().getFullYear()} Kredix. <a style="color:#94a3b8;text-decoration:underline;">Se désinscrire</a></div>
  </td></tr>
</table>`;

/**
 * Construit le document d'aperçu "Email envoyé" — fidèle au rendu réel.
 *
 * - Document HTML complet (importé / blocs) → on PRÉSERVE le design original
 *   et on injecte uniquement le footer de désinscription RGPD (comme le serveur).
 * - Fragment HTML (texte simple) → on applique le wrapper branded Kredix.
 */
function buildPreviewDoc(rawHtml: string, opts: {
  bannerVisible: boolean;
  footer: EmailFooterData;
}): string {
  // Document complet : préserver le design, injecter le footer désinscription.
  if (isFullHtmlDocument(rawHtml)) {
    const bodyClose = rawHtml.match(/<\/body>\s*/i);
    if (bodyClose && bodyClose.index !== undefined) {
      return rawHtml.slice(0, bodyClose.index) + PREVIEW_UNSUB_FOOTER + rawHtml.slice(bodyClose.index);
    }
    return rawHtml + PREVIEW_UNSUB_FOOTER;
  }

  // Fragment : wrapper branded Kredix (comportement inchangé).
  const body = extractBodyContent(rawHtml);
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
  headerHtml: string | null;
  footerHtml: string | null;
  isConfidential: boolean;
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

  // En-tête / pied de page personnalisés (par template).
  const [headerInput, setHeaderInput] = useState('');
  const [footerInput, setFooterInput] = useState('');

  // Mode import HTML.
  const [htmlArea, setHtmlArea] = useState('');
  const [importName, setImportName] = useState('');
  const [importTrigger, setImportTrigger] = useState<string>('reception_ack');
  const [importLanguage, setImportLanguage] = useState<string>('fr');
  const [dzFile, setDzFile] = useState('');
  const [dragging, setDragging] = useState(false);

  // Footer (toujours éditable, mais stocké séparément — pas encore persisté en DB).
  const [footerData, setFooterData] = useState<EmailFooterData>(DEFAULT_FOOTER);

  // IA — génération assistée.
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiAgentRole, setAiAgentRole] = useState<string>('accueil');
  const [aiPrompt, setAiPrompt] = useState('');

  // Éditeur de blocs (sous-menu dédié).
  const [beBlocks, setBeBlocks] = useState<EmailBlock[]>([]);
  const [beName, setBeName] = useState('');
  const [beTrigger, setBeTrigger] = useState<string>('reception_ack');
  const [beSubject, setBeSubject] = useState('');
  const [beLanguage, setBeLanguage] = useState<string>('fr');
  const [beBanner, setBeBanner] = useState(true);

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
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);

  // ID du template en cours d'édition (null = création nouvelle).
  const [editingId, setEditingId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const htmlAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Mémorise la dernière position du curseur dans le textarea HTML (mode import).
  const lastHtmlCursor = useRef<number>(0);
  const headerRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);

  // Édition WYSIWYG inline dans l'aperçu (mode import).
  const [inlineEditing, setInlineEditing] = useState(false);

  // ---------------------------------------------------------------------------
  // Édition WYSIWYG — active designMode sur l'iframe d'aperçu.
  // On édite le HTML BRUT (avec {{Variables}}) pour que l'admin modifie le
  // template réel, pas les valeurs d'exemple. Au moment d'appliquer, on lit
  // le document via la ref et on normalise les artefacts contentEditable.
  // ---------------------------------------------------------------------------

  function startInlineEditing() {
    if (!htmlArea.trim()) return;
    setInlineEditing(true);
    setPreviewMode('raw');
    // Active designMode après le prochain rendu de l'iframe (srcDoc change).
    requestAnimationFrame(() => {
      const iframe = previewIframeRef.current;
      if (iframe?.contentDocument) {
        iframe.contentDocument.designMode = 'on';
        iframe.contentWindow?.focus();
      }
    });
  }

  function applyInlineEdits() {
    const doc = previewIframeRef.current?.contentDocument;
    if (!doc) {
      setInlineEditing(false);
      return;
    }
    let edited = doc.documentElement.outerHTML;
    edited = normalizeVars(edited);
    setHtmlArea(edited);
    doc.designMode = 'off';
    setInlineEditing(false);
    setPreviewMode('data');
  }

  function cancelInlineEditing() {
    const doc = previewIframeRef.current?.contentDocument;
    if (doc) doc.designMode = 'off';
    setInlineEditing(false);
    setPreviewMode('data');
  }

  /**
   * Nettoie les artefacts introduits par contentEditable :
   *  - zero-width spaces (U+200B) insérés par le navigateur
   *  - espaces insécables parasites
   * Les variables {{...}} sont préservées telles quelles (texte simple).
   */
  function normalizeVars(html: string): string {
    return html
      .replace(/\u200B/g, '')
      .replace(/\uFEFF/g, '');
  }

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

  // Génère un brouillon d'email via l'IA et l'injecte dans le corps.
  async function generateWithAI() {
    setAiGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentRole: aiAgentRole,
          trigger: triggerInput,
          userPrompt: aiPrompt || undefined,
          leadContext: {
            firstName: 'Prospect',
            preferredLanguage: languageInput,
          },
          fallbackSubject: subjInput,
          fallbackBody: bodyInput,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `Échec génération IA (${res.status})`);
      }
      const json = await res.json();
      const data = json.data ?? json;
      if (data.warning) setError(data.warning);
      if (data.subject) setSubjInput(data.subject);
      if (data.bodyText) setBodyInput(data.bodyText);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setAiGenerating(false);
    }
  }

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

  // Insertion au curseur dans la zone de code HTML (mode import).
  // Utilise lastHtmlCursor pour ne pas insérer en position 0 si le textarea
  // n'a pas le focus au moment du clic sur la variable.
  function insertVarImport(v: string) {
    const ta = htmlAreaRef.current;
    // Si le textarea a le focus, on utilise sa position de curseur actuelle.
    // Sinon, on utilise la dernière position mémorisée (ou la fin du texte par défaut).
    const hasFocus = ta && document.activeElement === ta;
    const s = hasFocus ? ta!.selectionStart : (lastHtmlCursor.current || htmlArea.length);
    const e = hasFocus ? ta!.selectionEnd : (lastHtmlCursor.current || htmlArea.length);
    const next = htmlArea.slice(0, s) + v + htmlArea.slice(e);
    setHtmlArea(next);
    lastHtmlCursor.current = s + v.length;
    requestAnimationFrame(() => {
      ta?.focus();
      if (ta) ta.selectionStart = ta.selectionEnd = s + v.length;
    });
  }

  // Variables groupées par catégorie pour le rendu des chips.
  const VAR_GROUPS = VARS.reduce<Record<string, string[]>>((acc, v) => {
    (acc[v.group] ??= []).push(v.value);
    return acc;
  }, {});

  // Insertion générique au curseur dans n'importe quel textarea.
  function insertVarIn(
    v: string,
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setter: (s: string) => void,
  ) {
    const ta = ref.current;
    if (!ta) { setter(value + v); return; }
    const hasFocus = document.activeElement === ta;
    const s = hasFocus ? ta.selectionStart : value.length;
    const e = hasFocus ? ta.selectionEnd : value.length;
    const next = value.slice(0, s) + v + value.slice(e);
    setter(next);
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

  const interpolatedHtml = htmlArea.trim()
    ? Object.keys(SAMPLE).reduce((acc, v) => acc.split(v).join(SAMPLE[v]), htmlArea)
    : '';

  const composedIframeDoc = interpolatedHtml
    ? buildPreviewDoc(interpolatedHtml, { bannerVisible, footer: footerData })
    : '';

  const fullscreenIframeDoc = iframeRenderMode === 'composed' ? composedIframeDoc : importSrcDoc;

  // ---------------------------------------------------------------------------
  // Actions UI
  // ---------------------------------------------------------------------------

  // Charge un template existant dans l'éditeur pour modification.
  const editTemplate = (tpl: Template) => {
    setEditingId(tpl.id);
    setNameInput(tpl.name);
    setTriggerInput(tpl.trigger);
    setLanguageInput(tpl.language);
    setSubjInput(tpl.subject);
    setBodyInput(tpl.bodyText);
    setBannerVisible(tpl.bannerEnabled);
    setHeaderInput(tpl.headerHtml ?? '');
    setFooterInput(tpl.footerHtml ?? '');
    // Si le template a du HTML importé, bascule en mode import.
    if (tpl.htmlContent) {
      setHtmlArea(tpl.htmlContent);
      setImportName(tpl.name);
      setImportTrigger(tpl.trigger);
      setImportLanguage(tpl.language);
      setActiveMode('import');
    } else {
      setHtmlArea('');
      setActiveMode('visuel');
    }
    setActiveSub('generer');
  };

  // Réinitialise l'éditeur pour une nouvelle création.
  const resetEditor = () => {
    setEditingId(null);
    setHtmlArea('');
    setDzFile('');
    setImportName('');
    setBodyInput(DEFAULT_BODY);
    setSubjInput('Votre dossier a bien été reçu, {{Prénom}}');
    setNameInput('Confirmation de demande');
    setTriggerInput('reception_ack');
    setLanguageInput('fr');
    setImportTrigger('reception_ack');
    setImportLanguage('fr');
    setHeaderInput('');
    setFooterInput('');
  };

  // ---------------------------------------------------------------------------
  // Actions API
  // ---------------------------------------------------------------------------

  // Crée ou met à jour un template (POST ou PATCH selon editingId).
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
        headerHtml: headerInput.trim() || null,
        footerHtml: footerInput.trim() || null,
      };
      // PATCH si on édite un template existant, POST sinon.
      const isEditing = !!editingId;
      const url = isEditing ? `/api/templates/${editingId}` : '/api/templates';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `Échec ${isEditing ? 'mise à jour' : 'création'} (${res.status})`);
      }
      const saved: Template = (await res.json()).data ?? (await res.json());
      if (isEditing) {
        setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        setTemplates((prev) => [saved, ...prev]);
      }
      setEditingId(null);
      setSaveModalOpen(false);
      setActiveSub('liste');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  // Sauvegarde un template créé avec l'éditeur de blocs.
  const saveBlockTemplate = async () => {
    if (beBlocks.length === 0) {
      setError('Ajoutez au moins un bloc avant de sauvegarder.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const html = blocksToFullHtml(beBlocks, { bannerEnabled: beBanner });
      const text = blocksToText(beBlocks);
      const blocksJson = JSON.stringify(beBlocks);
      const payload = {
        name: beName.trim() || 'Modèle blocs',
        trigger: beTrigger,
        language: beLanguage,
        status: 'active' as const,
        subject: beSubject.trim() || beName.trim() || 'Modèle blocs',
        bodyText: text,
        htmlContent: html,
        blocksJson,
        bannerEnabled: beBanner,
        headerHtml: headerInput.trim() || null,
        footerHtml: footerInput.trim() || null,
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
      // Reset.
      setBeBlocks([]);
      setBeName('');
      setBeSubject('');
      setActiveSub('liste');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  // Importe ou met à jour un template HTML (POST ou PATCH selon editingId).
  const importTemplate = async () => {
    if (!htmlArea.trim()) {
      setError('Aucun contenu HTML à importer.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEditing = !!editingId;
      const payload = {
        name: importName.trim() || 'Modèle importé',
        trigger: importTrigger,
        language: importLanguage,
        status: 'active' as const,
        subject: importName.trim() || 'Modèle importé',
        bodyText: extractBodyContent(htmlArea).replace(/<[^>]+>/g, ' ').trim().slice(0, 500),
        htmlContent: htmlArea,
        bannerEnabled: bannerVisible,
        headerHtml: headerInput.trim() || null,
        footerHtml: footerInput.trim() || null,
      };
      // PATCH si on édite un template existant, POST sinon.
      const url = isEditing ? `/api/templates/${editingId}` : '/api/templates';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `Échec ${isEditing ? 'mise à jour' : 'import'} (${res.status})`);
      }
      const saved: Template = (await res.json()).data ?? (await res.json());
      if (isEditing) {
        setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        setTemplates((prev) => [saved, ...prev]);
      }
      // Reset.
      setEditingId(null);
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

  // Bascule le mode confidentiel d'un template (PATCH /api/templates/[id]).
  // Quand activé : l'IA ne peut ni lire, ni modifier, ni supprimer le modèle.
  const toggleConfidential = async (tpl: Template) => {
    setError(null);
    const next = !tpl.isConfidential;
    try {
      const res = await fetch(`/api/templates/${tpl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isConfidential: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? 'Échec bascule confidentiel');
      }
      const updated: Template = await res.json().then((j) => j.data);
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
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
        <div className={`submenu${activeSub === 'blocs' ? ' active' : ''}`} onClick={() => setActiveSub('blocs')}>
          Éditeur de blocs
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
                  <div className="ai-gen-block">
                    <textarea
                      className="ai-prompt-input"
                      placeholder="Décris ce que tu veux que l'IA rédige (ex: « Email d'accueil chaleureux pour un prospect qui demande un prêt immo de 200 000 € »). Laisse vide pour utiliser le contexte par défaut de l'agent."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={2}
                      disabled={aiGenerating}
                    />
                    <div className="ai-gen-row">
                      <select
                        className="ai-agent-pick"
                        value={aiAgentRole}
                        onChange={(e) => setAiAgentRole(e.target.value)}
                        disabled={aiGenerating}
                      >
                        <option value="accueil">Agent Accueil</option>
                        <option value="offre">Agent Offre</option>
                        <option value="relance">Agent Relance</option>
                      </select>
                      <button
                        type="button"
                        className="btn-ai-gen"
                        onClick={generateWithAI}
                        disabled={aiGenerating}
                      >
                        <Icon name="sparkles" size={15} />
                        {aiGenerating ? 'Génération…' : 'Générer avec l\'IA'}
                      </button>
                    </div>
                  </div>
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
                  <h4>En-tête &amp; pied de page personnalisés</h4>
                  <p className="var-hint">
                    Personnalisez l&apos;en-tête et le pied de page <b>pour ce template</b>. Laissez vide pour utiliser
                    le design par défaut (logo + coordonnées + lien de désinscription). Supporte les variables.
                  </p>
                  <label className="field-label" style={{ marginTop: 8 }}>En-tête HTML (optionnel)</label>
                  <textarea
                    className="html-area"
                    ref={headerRef}
                    style={{ minHeight: 80 }}
                    placeholder="<table><tr><td>Bonjour depuis {{NomSite}}</td></tr></table>"
                    value={headerInput}
                    onChange={(e) => setHeaderInput(e.target.value)}
                  />
                  <div className="var-chips" style={{ marginTop: 6 }}>
                    {VARS.map((v) => (
                      <span className="chip" key={v.value} onClick={() => insertVarIn(v.value, headerRef, headerInput, setHeaderInput)}>{v.value}</span>
                    ))}
                  </div>
                  <label className="field-label" style={{ marginTop: 14 }}>Pied de page HTML (optionnel)</label>
                  <textarea
                    className="html-area"
                    ref={footerRef}
                    style={{ minHeight: 80 }}
                    placeholder={'<table><tr><td>© {{NomSite}} — <a href="{{LienDesinscription}}">Se désinscrire</a></td></tr></table>'}
                    value={footerInput}
                    onChange={(e) => setFooterInput(e.target.value)}
                  />
                  <div className="var-chips" style={{ marginTop: 6 }}>
                    {VARS.map((v) => (
                      <span className="chip" key={`f-${v.value}`} onClick={() => insertVarIn(v.value, footerRef, footerInput, setFooterInput)}>{v.value}</span>
                    ))}
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
                  {Object.entries(VAR_GROUPS).map(([group, vars]) => (
                    <div key={group} style={{ marginBottom: 12 }}>
                      <div className="var-group-label">{group}</div>
                      <div className="var-chips">
                        {vars.map((v) => <span className="chip" key={v} onClick={() => insertVar(v)}>{v}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={() => setSaveModalOpen(true)} disabled={saving}>
                  {editingId ? 'Mettre à jour le modèle' : 'Enregistrer le modèle'}
                </button>
                {editingId && (
                  <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={resetEditor}>
                    Nouveau modèle
                  </button>
                )}
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
                  <textarea className="html-area" ref={htmlAreaRef} placeholder="<html><body>Bonjour {{Prénom}}…</body></html>" value={htmlArea} onChange={(e) => setHtmlArea(e.target.value)} onClick={(e) => { const ta = e.currentTarget; lastHtmlCursor.current = ta.selectionStart; }} onKeyUp={(e) => { const ta = e.currentTarget; lastHtmlCursor.current = ta.selectionStart; }} onSelect={(e) => { const ta = e.currentTarget; lastHtmlCursor.current = ta.selectionStart; }} />
                  {detected.length > 0 && (
                    <div className="detected">
                      <h4>Variables détectées</h4>
                      <p className="dh">Trouvées dans le HTML. L&apos;agent les remplacera à chaque envoi.</p>
                      <div className="var-chips">{detected.map((v) => <span className="chip" key={v}>{v}</span>)}</div>
                    </div>
                  )}
                </div>
                <div className="sub-panel">
                  <h4>Insérer une variable</h4>
                  <p className="var-hint">Cliquez sur une variable pour l&apos;insérer dans votre code HTML, à l&apos;endroit du curseur. L&apos;agent la remplacera par la donnée réelle à l&apos;envoi.</p>
                  {Object.entries(VAR_GROUPS).map(([group, vars]) => (
                    <div key={group} style={{ marginBottom: 12 }}>
                      <div className="var-group-label">{group}</div>
                      <div className="var-chips">
                        {vars.map((v) => <span className="chip" key={v} onClick={() => insertVarImport(v)}>{v}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="frow">
                  <div className="fg full">
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
                <div className="sub-panel">
                  <h4>En-tête &amp; pied de page personnalisés</h4>
                  <p className="var-hint">
                    Personnalisez l&apos;en-tête et le pied de page <b>pour ce template</b>. Laissez vide pour utiliser
                    le design par défaut.
                  </p>
                  <label className="field-label" style={{ marginTop: 8 }}>En-tête HTML (optionnel)</label>
                  <textarea
                    className="html-area"
                    ref={headerRef}
                    style={{ minHeight: 70 }}
                    placeholder="<table><tr><td>Bonjour depuis {{NomSite}}</td></tr></table>"
                    value={headerInput}
                    onChange={(e) => setHeaderInput(e.target.value)}
                  />
                  <div className="var-chips" style={{ marginTop: 6 }}>
                    {VARS.map((v) => (
                      <span className="chip" key={v.value} onClick={() => insertVarIn(v.value, headerRef, headerInput, setHeaderInput)}>{v.value}</span>
                    ))}
                  </div>
                  <label className="field-label" style={{ marginTop: 14 }}>Pied de page HTML (optionnel)</label>
                  <textarea
                    className="html-area"
                    ref={footerRef}
                    style={{ minHeight: 70 }}
                    placeholder={'<table><tr><td>© {{NomSite}} — <a href="{{LienDesinscription}}">Se désinscrire</a></td></tr></table>'}
                    value={footerInput}
                    onChange={(e) => setFooterInput(e.target.value)}
                  />
                  <div className="var-chips" style={{ marginTop: 6 }}>
                    {VARS.map((v) => (
                      <span className="chip" key={`f2-${v.value}`} onClick={() => insertVarIn(v.value, footerRef, footerInput, setFooterInput)}>{v.value}</span>
                    ))}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={importTemplate} disabled={saving || inlineEditing}>
                  {saving ? (editingId ? 'Mise à jour…' : 'Import…') : editingId ? 'Mettre à jour le modèle' : 'Importer comme modèle'}
                </button>
                {editingId && (
                  <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={resetEditor}>
                    Nouveau modèle
                  </button>
                )}
              </div>

              {/* IFRAME PREVIEW */}
              <div className="iframe-wrap">
                <div className="ifh">
                  <span>Aperçu du rendu</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {importSrcDoc && !inlineEditing && (
                      <button
                        className="tpl2-btn tpl2-btn-edit"
                        title="Modifier le texte directement dans l'aperçu"
                        onClick={startInlineEditing}
                        style={{ fontSize: 12 }}
                      >
                        <Icon name="pencil" size={14} />
                        Éditer dans l&apos;aperçu
                      </button>
                    )}
                    {inlineEditing && (
                      <>
                        <button
                          className="tpl2-btn tpl2-btn-toggle is-on"
                          title="Enregistrer les modifications"
                          onClick={applyInlineEdits}
                          style={{ fontSize: 12 }}
                        >
                          <Icon name="check" size={14} />
                          Appliquer
                        </button>
                        <button
                          className="tpl2-btn tpl2-btn-delete"
                          title="Annuler les modifications"
                          onClick={cancelInlineEditing}
                          style={{ fontSize: 12 }}
                        >
                          Annuler
                        </button>
                      </>
                    )}
                    {importSrcDoc && !inlineEditing && (
                      <button className="pv-expand-btn" title="Aperçu plein écran" onClick={() => setFullIframeOpen(true)}>
                        <Icon name="search" size={18} />
                      </button>
                    )}
                  </div>
                </div>
                {inlineEditing ? (
                  <iframe
                    ref={previewIframeRef}
                    srcDoc={htmlArea}
                    title="Édition"
                    onLoad={() => {
                      const iframe = previewIframeRef.current;
                      if (iframe?.contentDocument) {
                        iframe.contentDocument.designMode = 'on';
                        iframe.contentWindow?.focus();
                      }
                    }}
                  />
                ) : importSrcDoc ? (
                  <iframe srcDoc={importSrcDoc} title="Aperçu" />
                ) : (
                  <div className="iframe-empty">Importez ou collez du HTML pour voir l&apos;aperçu.</div>
                )}
                {inlineEditing && (
                  <div className="info-band" style={{ marginTop: 8, fontSize: 12 }}>
                    <div className="imark" style={{ background: '#dbeafe', color: '#1e40af' }}>✏️</div>
                    <div>
                      Cliquez sur un texte dans l&apos;aperçu pour le modifier directement. Les variables{' '}
                      <code>{'{{Prénom}}'}</code> sont visibles et éditables. Cliquez sur{' '}
                      <b>Appliquer</b> pour enregistrer vos modifications dans le code HTML.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSub === 'blocs' && (
        <div className="subview active" id="blocs">
          <div className="info-band">
            <div className="imark">i</div>
            <div>
              Construisez vos emails <b>bloc par bloc</b> (titres, textes, boutons, séparateurs, CTA WhatsApp/Messenger…)
              par glisser-déposer. Aucune compétence technique requise. Le HTML compatible tous les clients mail est
              généré automatiquement.
            </div>
          </div>

          {/* Paramètres du template */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h3>Paramètres du modèle</h3>
            </div>
            <div className="panel-body">
              <div className="grid2">
                <div className="fg">
                  <label className="field-label">Nom du modèle</label>
                  <input
                    type="text"
                    placeholder="Ex: Accueil prospect immo"
                    value={beName}
                    onChange={(e) => setBeName(e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label className="field-label">Objet de l&apos;email</label>
                  <input
                    type="text"
                    placeholder="Ex: Bonjour {{Prénom}}, bienvenue chez Kredix"
                    value={beSubject}
                    onChange={(e) => setBeSubject(e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label className="field-label">Déclencheur</label>
                  <select value={beTrigger} onChange={(e) => setBeTrigger(e.target.value)}>
                    <option value="reception_ack">Accusé de réception</option>
                    <option value="offer">Offre formalisée</option>
                    <option value="relance_1">Relance 1 (J+3)</option>
                    <option value="relance_2">Relance 2 (J+6)</option>
                    <option value="relance_3">Relance 3 (J+9)</option>
                    <option value="manual">Envoi manuel</option>
                    <option value="level_1">Niveau 1 — Accueil client</option>
                    <option value="level_2">Niveau 2 — Documents</option>
                    <option value="level_3">Niveau 3 — Offre de prêt</option>
                    <option value="level_4">Niveau 4 — Vérification</option>
                    <option value="level_5">Niveau 5 — Accord de principe</option>
                    <option value="level_6">Niveau 6 — Signature</option>
                    <option value="level_7">Niveau 7 — Déblocage fonds</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="field-label">Langue</label>
                  <select value={beLanguage} onChange={(e) => setBeLanguage(e.target.value)}>
                    <option value="fr">Français</option>
                    <option value="de">Allemand</option>
                    <option value="en">Anglais</option>
                    <option value="es">Espagnol</option>
                    <option value="it">Italien</option>
                    <option value="pt">Portugais</option>
                  </select>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={beBanner} onChange={(e) => setBeBanner(e.target.checked)} />
                Bannière d&apos;en-tête Kredix (image)
              </label>
            </div>
          </div>

          {/* Éditeur de blocs */}
          <div className="panel">
            <div className="panel-head">
              <h3>Composez votre email</h3>
              <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>
                {beBlocks.length} bloc{beBlocks.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <EmailBlockEditor
                blocks={beBlocks}
                onChange={setBeBlocks}
                bannerEnabled={beBanner}
              />
            </div>
            <div className="panel-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setBeBlocks([]); setBeName(''); setBeSubject(''); }}
                disabled={beBlocks.length === 0 || saving}
              >
                Vider
              </button>
              <button
                className="btn btn-primary"
                onClick={saveBlockTemplate}
                disabled={beBlocks.length === 0 || saving}
              >
                {saving ? 'Sauvegarde…' : 'Sauvegarder le modèle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSub === 'liste' && (
        <div className="subview active" id="liste">
          <div className="tpl-list-head">
            <div className="tpl-list-count">
              {loading
                ? 'Chargement…'
                : `${templates.length} modèle${templates.length > 1 ? 's' : ''} · utilisés automatiquement par les agents à chaque envoi`}
            </div>
            <button className="btn btn-primary" onClick={() => setActiveSub('generer')}>
              <Icon name="plus" size={16} />
              Nouveau modèle
            </button>
          </div>
          <div className="tpl-grid">
            {templates.map((tpl) => (
              <div className={`tpl-card2 ${tpl.status === 'active' ? 'is-active' : 'is-draft'}`} key={tpl.id}>
                <div className="tpl2-header">
                  <div className="tpl2-header-left">
                    <span className={`tpl2-status-dot ${tpl.status === 'active' ? 'active' : 'draft'}`} />
                    <div>
                      <div className="tpl2-name">
                        {tpl.name}
                        {tpl.isConfidential && (
                          <span className="tpl2-confidential" title="Confidentiel — l'IA ne peut pas accéder à ce modèle">
                            <Icon name="lock" size={12} /> Confidentiel
                          </span>
                        )}
                      </div>
                      <div className="tpl2-trigger">{TRIGGER_LABEL[tpl.trigger] ?? tpl.trigger}</div>
                    </div>
                  </div>
                  <span className={`tpl2-badge ${tpl.status === 'active' ? 'badge-active' : 'badge-draft'}`}>
                    {tpl.status === 'active' ? 'Actif' : 'Brouillon'}
                  </span>
                </div>
                <div className="tpl2-body">
                  <div className="tpl2-excerpt">{tpl.bodyText?.slice(0, 180) ?? '—'}{(tpl.bodyText?.length ?? 0) > 180 ? '…' : ''}</div>
                </div>
                <div className="tpl2-vars">
                  {(detectVars(tpl.bodyText ?? '')).slice(0, 6).map((v) => <span className="tpl2-var" key={v}>{v}</span>)}
                </div>
                <div className="tpl2-footer">
                  <div className="tpl2-meta">
                    <span className="tpl2-lang">{(tpl.language || 'fr').toUpperCase()}</span>
                    <span className="tpl2-type">{tpl.htmlContent ? 'HTML' : 'Visuel'}</span>
                  </div>
                  <div className="tpl2-actions">
                    <button className="tpl2-btn tpl2-btn-preview" onClick={() => setPreviewTpl(tpl)} title="Aperçu de l'email">
                      <Icon name="search" size={15} />
                      Aperçu
                    </button>
                    <button
                      className="tpl2-btn tpl2-btn-edit"
                      onClick={() => editTemplate(tpl)}
                      title="Modifier le modèle"
                      disabled={tpl.isConfidential}
                      style={tpl.isConfidential ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                    >
                      <Icon name="pencil" size={15} />
                      Modifier
                    </button>
                    <button
                      className={`tpl2-btn tpl2-btn-toggle ${tpl.status === 'active' ? 'is-on' : ''}`}
                      onClick={() => toggleTemplateStatus(tpl)}
                      title={tpl.status === 'active' ? 'Désactiver' : 'Activer'}
                    >
                      <Icon name={tpl.status === 'active' ? 'pause' : 'play'} size={15} />
                      {tpl.status === 'active' ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      className={`tpl2-btn ${tpl.isConfidential ? 'tpl2-btn-confidential-on' : 'tpl2-btn-confidential'}`}
                      onClick={() => toggleConfidential(tpl)}
                      title={tpl.isConfidential ? 'Désactiver le mode confidentiel' : 'Activer le mode confidentiel — l\'IA ne pourra plus accéder à ce modèle'}
                    >
                      <Icon name={tpl.isConfidential ? 'lock' : 'unlock'} size={15} />
                    </button>
                    <button
                      className="tpl2-btn tpl2-btn-delete"
                      onClick={() => setDeleteTarget(tpl)}
                      title="Supprimer"
                      disabled={tpl.isConfidential}
                      style={tpl.isConfidential ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MODAL SAVE ===== */}
      <Modal isOpen={saveModalOpen} onClose={() => setSaveModalOpen(false)} title={editingId ? 'Mettre à jour le modèle' : 'Enregistrer le modèle'}>
        <p className="field-hint">
          {editingId
            ? 'Le modèle sera mis à jour et activé.'
            : 'Le modèle sera sauvegardé et activé. S\'il existe déjà un template actif pour le même déclencheur, il sera passé en brouillon.'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
          <b>Modèle :</b> {nameInput}<br />
          <b>Déclencheur :</b> {TRIGGER_LABEL[triggerInput] ?? triggerInput}<br />
          <b>Statut :</b> Actif
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setSaveModalOpen(false)} disabled={saving}>Annuler</button>
          <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
            {saving ? 'Enregistrement…' : editingId ? 'Confirmer la mise à jour' : 'Confirmer l\'enregistrement'}
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

      {/* ===== PREVIEW SINGLE TEMPLATE ===== */}
      <Modal
        isOpen={!!previewTpl}
        onClose={() => setPreviewTpl(null)}
        title={`Aperçu — ${previewTpl?.name ?? ''}`}
        wide
      >
        {previewTpl && (
          <div className="tpl-preview-modal">
            <div className="tpl-preview-info">
              <div className="pv-from">Objet : {previewTpl.subject}</div>
              <div className="tpl-preview-tags">
                <span className="tpl2-lang">{(previewTpl.language || 'fr').toUpperCase()}</span>
                <span className="tpl2-type">{previewTpl.htmlContent ? 'HTML' : 'Visuel'}</span>
                <span>{TRIGGER_LABEL[previewTpl.trigger] ?? previewTpl.trigger}</span>
              </div>
            </div>
            <div className="tpl-preview-body">
              <EmailHeader bannerVisible={previewTpl.bannerEnabled} />
              <div className="tpl-preview-text">{renderFilled(previewTpl.bodyText ?? '', 'data')}</div>
              <EmailFooter data={footerData} />
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setPreviewTpl(null)}>Fermer</button>
          {previewTpl && (
            <button className="btn btn-primary" onClick={() => { editTemplate(previewTpl); setPreviewTpl(null); }}>
              <Icon name="pencil" size={15} />
              Modifier ce modèle
            </button>
          )}
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
