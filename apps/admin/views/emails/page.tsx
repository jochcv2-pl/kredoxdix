'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
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
  // Prospect (variables historiques PascalCase)
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
  // Prospect (variables snake_case)
  { value: '{{prenom}}', group: 'Prospect (nouvelles)' },
  { value: '{{nom}}', group: 'Prospect (nouvelles)' },
  { value: '{{nom_entreprise}}', group: 'Prospect (nouvelles)' },
  { value: '{{type_pret}}', group: 'Prospect (nouvelles)' },
  { value: '{{montant_pret}}', group: 'Prospect (nouvelles)' },
  { value: '{{reference_demande}}', group: 'Prospect (nouvelles)' },
  { value: '{{date_soumission}}', group: 'Prospect (nouvelles)' },
  { value: '{{date_envoi_offre}}', group: 'Prospect (nouvelles)' },
  { value: '{{date_expiration_offre}}', group: 'Prospect (nouvelles)' },
  // Conseiller (cascade : admin assigné → CMS → fallback traduit)
  { value: '{{prenom_conseiller}}', group: 'Conseiller' },
  { value: '{{nom_conseiller}}', group: 'Conseiller' },
  { value: '{{nom_complet_conseiller}}', group: 'Conseiller' },
  { value: '{{initiales_conseiller}}', group: 'Conseiller' },
  { value: '{{telephone_conseiller}}', group: 'Conseiller' },
  { value: '{{email_conseiller}}', group: 'Conseiller' },
  // Liens & URLs (désinscription, suivi, URLs configurables au CMS)
  { value: '{{lien_desabonnement}}', group: 'Liens & URLs' },
  { value: '{{lien_suivi}}', group: 'Liens & URLs' },
  { value: '{{url_formulaire}}', group: 'Liens & URLs' },
  { value: '{{url_messenger}}', group: 'Liens & URLs' },
  { value: '{{url_contact_conseiller}}', group: 'Liens & URLs' },
  // Marque (données du site / agence)
  { value: '{{NomSite}}', group: 'Marque' },
  { value: '{{SiteUrl}}', group: 'Marque' },
  { value: '{{LogoUrl}}', group: 'Marque' },
  { value: '{{ContactEmail}}', group: 'Marque' },
  { value: '{{TéléphoneAgence}}', group: 'Marque' },
  { value: '{{AdresseAgence}}', group: 'Marque' },
  { value: '{{adresse_siege}}', group: 'Marque' },
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
  // snake_case — valeurs d'exemple (aperçu Données réelles + mode import)
  '{{prenom}}': 'Marie',
  '{{nom}}': 'Lefèvre',
  '{{nom_entreprise}}': 'Entreprise SAS',
  '{{type_pret}}': 'immobilier',
  '{{montant_pret}}': '210 000 €',
  '{{reference_demande}}': 'KREDIX-XXXXXXXX',
  '{{date_soumission}}': '05/08/2026',
  '{{date_envoi_offre}}': '05/08/2026',
  '{{date_expiration_offre}}': '19/08/2026',
  '{{prenom_conseiller}}': 'Marie',
  '{{nom_conseiller}}': 'Lefèvre',
  '{{nom_complet_conseiller}}': 'Marie Lefèvre',
  '{{initiales_conseiller}}': 'ML',
  '{{telephone_conseiller}}': '01 23 45 67 89',
  '{{email_conseiller}}': 'contact@kredix.fr',
  '{{adresse_siege}}': '12 rue de la Finance, 75001 Paris',
  '{{lien_desabonnement}}': 'https://kredix.fr/api/unsubscribe?t=...',
  '{{lien_suivi}}': 'https://kredix.fr/fr/suivi?ref=KREDIX-XXXXXXXX&token=...',
  '{{url_formulaire}}': 'https://kredix.fr/fr#demande',
  '{{url_messenger}}': 'https://m.me/kredix',
  '{{url_contact_conseiller}}': 'https://calendly.com/conseiller/rdv',
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

/**
 * Construit le document d'aperçu "Email envoyé" — fidèle au rendu réel.
 *
 * - Document HTML complet (importé) → affiché TEL QUEL, sans injection.
 * - Fragment HTML (texte simple) → document HTML minimal sans header/footer.
 */
function buildPreviewDoc(rawHtml: string): string {
  // Document complet : affiché tel quel, aucune modification.
  if (isFullHtmlDocument(rawHtml)) {
    return rawHtml;
  }

  // Fragment : document HTML minimal (pas de header, pas de footer).
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
${extractBodyContent(rawHtml)}
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

  // Mode import HTML.
  const [htmlArea, setHtmlArea] = useState('');
  const [importName, setImportName] = useState('');
  const [importTrigger, setImportTrigger] = useState<string>('reception_ack');
  const [importLanguage, setImportLanguage] = useState<string>('fr');
  const [dzFile, setDzFile] = useState('');
  const [dragging, setDragging] = useState(false);

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

  // Test send
  const [testTarget, setTestTarget] = useState<Template | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Envoi ponctuel (adhoc) — destinataire hors CRM + édition ponctuelle du contenu
  const [adhocTarget, setAdhocTarget] = useState<Template | null>(null);
  const [adhocStep, setAdhocStep] = useState<1 | 2>(1);
  const [adhocTo, setAdhocTo] = useState('');
  const [adhocFirstName, setAdhocFirstName] = useState('');
  const [adhocLastName, setAdhocLastName] = useState('');
  const [adhocMessage, setAdhocMessage] = useState('');
  // Contenu éditable (pré-rempli du modèle — NON sauvegardé après envoi).
  const [adhocSubject, setAdhocSubject] = useState('');
  const [adhocBody, setAdhocBody] = useState('');
  const [adhocIsHtml, setAdhocIsHtml] = useState(false);
  // Étape 2 — bascule Source / Aperçu + édition WYSIWYG dans l'iframe.
  const [adhocView, setAdhocView] = useState<'source' | 'preview'>('source');
  const [adhocInlineEditing, setAdhocInlineEditing] = useState(false);
  const adhocIframeRef = useRef<HTMLIFrameElement>(null);
  const [adhocSending, setAdhocSending] = useState(false);
  const [adhocResult, setAdhocResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Pipeline test (Bienvenue, Offre, R1, R2, R3)
  const [ptStep, setPtStep] = useState<string | null>(null);
  const [ptEmail, setPtEmail] = useState('');
  const [ptSending, setPtSending] = useState(false);
  const [ptResult, setPtResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const PIPELINE_STEPS = [
    { key: 'welcome', label: 'Bienvenue', icon: 'mail', desc: 'T+5min — Accusé de réception Agent Accueil', hasPdf: false },
    { key: 'offer', label: 'Offre', icon: 'file-text', desc: 'T+20min — Offre formalisée + PDF amortissement', hasPdf: true },
    { key: 'relance_1', label: 'Relance J+3', icon: 'clipboard', desc: 'J+3 — Relance 1 + PDF amortissement', hasPdf: true },
    { key: 'relance_2', label: 'Relance J+6', icon: 'star', desc: 'J+6 — Relance 2 + PDF amortissement', hasPdf: true },
    { key: 'relance_3', label: 'Relance J+9', icon: 'star-off', desc: 'J+9 — Relance 3 (sans PDF)', hasPdf: false },
  ];

  async function handlePipelineTest() {
    if (!ptStep || !ptEmail.trim()) return;
    setPtSending(true);
    setPtResult(null);
    try {
      const res = await fetch('/api/pipeline-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: ptStep, email: ptEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setPtResult({ ok: true, msg: `${json.data.label} envoyé à ${json.data.email}${json.data.hasPdf ? ' (PDF joint)' : ''}` });
    } catch (e) {
      setPtResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setPtSending(false);
    }
  }

  // ID du template en cours d'édition (null = création nouvelle).
  const [editingId, setEditingId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const htmlAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Mémorise la dernière position du curseur dans le textarea HTML (mode import).
  // Sans ça, si l'utilisateur clique une variable sans avoir mis le curseur dans
  // le textarea, selectionStart = 0 et la variable s'insère tout en haut.
  const lastHtmlCursor = useRef<number>(0);

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
    ? buildPreviewDoc(interpolatedHtml)
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
        bannerEnabled: false,
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
      const html = blocksToFullHtml(beBlocks, { bannerEnabled: false });
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
        bannerEnabled: false,
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
        bannerEnabled: false,
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

  // --- Test send ---
  const openTestModal = (tpl: Template) => {
    setTestTarget(tpl);
    setTestEmail('');
    setTestResult(null);
  };

  // --- Envoi ponctuel (adhoc) ---
  const openAdhocModal = (tpl: Template) => {
    setAdhocTarget(tpl);
    setAdhocStep(1);
    setAdhocTo('');
    setAdhocFirstName('');
    setAdhocLastName('');
    setAdhocMessage('');
    setAdhocResult(null);
    // Pré-remplit le contenu éditable depuis le modèle (étape 2).
    setAdhocSubject(tpl.subject);
    setAdhocBody(tpl.htmlContent ?? tpl.bodyText);
    const isHtml = !!tpl.htmlContent;
    setAdhocIsHtml(isHtml);
    // Modèle HTML → aperçu rendu par défaut ; modèle texte → source.
    setAdhocView(isHtml ? 'preview' : 'source');
    setAdhocInlineEditing(false);
  };

  const handleAdhocSend = async () => {
    if (!adhocTarget || !adhocTo.trim()) return;
    setAdhocSending(true);
    setAdhocResult(null);
    try {
      const res = await fetch('/api/emails/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: adhocTarget.id,
          to: adhocTo.trim(),
          firstName: adhocFirstName.trim() || undefined,
          lastName: adhocLastName.trim() || undefined,
          customMessage: adhocMessage.trim() || undefined,
          // Contenu édité (étape 2) — ponctuel, jamais réécrit dans le modèle.
          subject: adhocSubject,
          ...(adhocIsHtml ? { bodyHtml: adhocBody } : { bodyText: adhocBody }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errData = json?.data ?? json;
        throw new Error(errData?.error ?? errData?.message ?? `Échec (${res.status})`);
      }
      setAdhocResult({ ok: true, msg: `Email envoyé à ${adhocTo.trim()} ✓` });
    } catch (e) {
      setAdhocResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setAdhocSending(false);
    }
  };

  // --- Étape 2 : aperçu rendu + édition WYSIWYG (pattern du mode import) ---
  // Les variables sont interpolées avec les informations de l'étape 1
  // (destinataire, prénom, nom, message) — fallbacks d'exemple pour le reste.

  /** Échappe le texte brut pour affichage HTML sûr dans l'iframe. */
  function escapeHtmlText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Map variables → valeurs, basée sur SAMPLE puis surchargée par l'étape 1. */
  function buildAdhocPreviewVars(): Record<string, string> {
    const prenom = adhocFirstName.trim() || SAMPLE['{{Prénom}}'];
    const nom = adhocLastName.trim() || SAMPLE['{{Nom}}'];
    const email = adhocTo.trim() || 'destinataire@exemple.com';
    const message = adhocMessage.trim() || '(message non renseigné)';
    return {
      ...SAMPLE,
      // Champs de l'étape 1 (PascalCase + snake_case)
      '{{Prénom}}': prenom, '{{Nom}}': nom, '{{Email}}': email, '{{Message}}': message,
      '{{prenom}}': prenom, '{{nom}}': nom,
      // Variables snake_case courantes (valeurs d'exemple / neutres)
      '{{nom_entreprise}}': 'Entreprise SAS',
      '{{reference_demande}}': 'KREDIX-XXXXXXXX',
      '{{date_soumission}}': new Date().toLocaleDateString('fr-FR'),
      '{{date_envoi_offre}}': new Date().toLocaleDateString('fr-FR'),
      '{{date_expiration_offre}}': new Date(Date.now() + 14 * 864e5).toLocaleDateString('fr-FR'),
      '{{type_pret}}': 'immobilier', '{{montant_pret}}': '210 000 €',
      '{{prenom_conseiller}}': 'Marie', '{{nom_conseiller}}': 'Lefèvre',
      '{{nom_complet_conseiller}}': 'Marie Lefèvre',
      '{{initiales_conseiller}}': 'ML',
      '{{telephone_conseiller}}': '01 23 45 67 89',
      '{{email_conseiller}}': 'contact@kredix.fr',
      '{{adresse_siege}}': '12 rue de la Finance, 75001 Paris',
      '{{lien_desabonnement}}': 'https://kredix.fr/api/unsubscribe?t=…',
      '{{lien_suivi}}': 'https://kredix.fr/fr/suivi?ref=KREDIX-XXXXXXXX&token=…',
      '{{url_formulaire}}': 'https://kredix.fr/fr#demande',
      '{{url_messenger}}': 'https://m.me/kredix',
      '{{url_contact_conseiller}}': 'https://calendly.com/conseiller/rdv',
    };
  }

  /** Document iframe de l'aperçu : variables interpolées + wrapper fidèle. */
  const adhocPreviewDoc = (() => {
    if (!adhocBody.trim()) return '';
    const vars = buildAdhocPreviewVars();
    const interpolated = Object.keys(vars).reduce(
      (acc, v) => acc.split(v).join(vars[v]),
      adhocBody,
    );
    if (adhocIsHtml) return buildPreviewDoc(interpolated);
    // Modèle texte : échappement + sauts de ligne (rendu fidèle textToHtml).
    return buildPreviewDoc(escapeHtmlText(interpolated).replace(/\n/g, '<br>'));
  })();

  /** Active l'édition directe dans l'iframe (designMode) — HTML uniquement. */
  function startAdhocInlineEditing() {
    if (!adhocBody.trim()) return;
    setAdhocInlineEditing(true);
    requestAnimationFrame(() => {
      const iframe = adhocIframeRef.current;
      if (iframe?.contentDocument) {
        iframe.contentDocument.designMode = 'on';
        iframe.contentWindow?.focus();
      }
    });
  }

  /** Récupère le document édité → adhocBody (les {{variables}} restent intactes). */
  function applyAdhocInlineEdits() {
    const doc = adhocIframeRef.current?.contentDocument;
    if (!doc) {
      setAdhocInlineEditing(false);
      return;
    }
    const edited = normalizeVars(doc.documentElement.outerHTML);
    setAdhocBody(edited);
    doc.designMode = 'off';
    setAdhocInlineEditing(false);
  }

  function cancelAdhocInlineEditing() {
    const doc = adhocIframeRef.current?.contentDocument;
    if (doc) doc.designMode = 'off';
    setAdhocInlineEditing(false);
  }

  const handleTestSend = async () => {
    if (!testTarget || !testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/templates/${testTarget.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errData = json?.data ?? json;
        throw new Error(errData?.error ?? errData?.message ?? `Échec (${res.status})`);
      }
      setTestResult({ ok: true, msg: `Email de test envoyé à ${testEmail.trim()}` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setTestSending(false);
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

      {/* ===== PIPELINE TEST — Tester chaque étape ===== */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h3>Pipeline — Test séquence</h3>
          <span style={{ fontSize: 11, color: 'var(--slate-light)' }}>Données démo : Jean Dupont, 250 000 € immo, 20 ans</span>
        </div>
        <div className="panel-body">
          <div className="modal-fg" style={{ marginBottom: 12 }}>
            <label>Adresse de test</label>
            <input
              type="email"
              placeholder="votre@email.com"
              value={ptEmail}
              onChange={(e) => setPtEmail(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>
          {ptResult && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12,
              background: ptResult.ok ? 'rgba(46,204,113,0.08)' : 'rgba(192,57,43,0.08)',
              color: ptResult.ok ? '#27ae60' : '#c0392b',
            }}>
              {ptResult.msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PIPELINE_STEPS.map((s) => (
              <button
                key={s.key}
                className="btn btn-ghost btn-sm"
                disabled={ptSending || !ptEmail.trim()}
                onClick={() => { setPtStep(s.key); setPtResult(null); handlePipelineTest() }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'center' }}
                title={s.desc}
              >
                <Icon name={s.icon} size={14} />
                {s.label}
                {s.hasPdf && <span style={{ fontSize: 10, color: 'var(--slate-light)' }}>PDF</span>}
                {ptStep === s.key && ptSending && <span style={{ fontSize: 10 }}>...</span>}
              </button>
            ))}
          </div>
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
                  {renderFilled(bodyInput, previewMode)}
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
                    {/* Boutons icônes seules — libellés complets en tooltip (title).
                        7 actions tiennent ainsi sur une seule ligne de carte. */}
                    <button className="tpl2-btn tpl2-btn-preview" onClick={() => setPreviewTpl(tpl)} title="Aperçu de l'email" aria-label="Aperçu">
                      <Icon name="search" size={15} />
                    </button>
                    <button
                      className="tpl2-btn tpl2-btn-test"
                      onClick={() => openTestModal(tpl)}
                      title="Envoyer un email de test (données démo)"
                      aria-label="Tester"
                    >
                      <Icon name="mail" size={15} />
                    </button>
                    <button
                      className="tpl2-btn tpl2-btn-send"
                      onClick={() => openAdhocModal(tpl)}
                      title="Envoi ponctuel à un destinataire hors CRM"
                      aria-label="Envoyer"
                    >
                      <Icon name="send" size={15} />
                    </button>
                    <button
                      className="tpl2-btn tpl2-btn-edit"
                      onClick={() => editTemplate(tpl)}
                      title="Modifier le modèle"
                      aria-label="Modifier"
                      disabled={tpl.isConfidential}
                      style={tpl.isConfidential ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      className={`tpl2-btn tpl2-btn-toggle ${tpl.status === 'active' ? 'is-on' : ''}`}
                      onClick={() => toggleTemplateStatus(tpl)}
                      title={tpl.status === 'active' ? 'Désactiver le modèle' : 'Activer le modèle'}
                      aria-label={tpl.status === 'active' ? 'Désactiver' : 'Activer'}
                    >
                      <Icon name={tpl.status === 'active' ? 'pause' : 'play'} size={15} />
                    </button>
                    <button
                      className={`tpl2-btn ${tpl.isConfidential ? 'tpl2-btn-confidential-on' : 'tpl2-btn-confidential'}`}
                      onClick={() => toggleConfidential(tpl)}
                      title={tpl.isConfidential ? 'Désactiver le mode confidentiel' : 'Activer le mode confidentiel — l\'IA ne pourra plus accéder à ce modèle'}
                      aria-label="Mode confidentiel"
                    >
                      <Icon name={tpl.isConfidential ? 'lock' : 'unlock'} size={15} />
                    </button>
                    <button
                      className="tpl2-btn tpl2-btn-delete"
                      onClick={() => setDeleteTarget(tpl)}
                      title="Supprimer"
                      aria-label="Supprimer"
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
            : triggerInput === 'manual'
              ? 'Le modèle sera sauvegardé et activé. Les envois manuels peuvent avoir plusieurs modèles actifs simultanément.'
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
          {renderFilled(bodyInput, previewMode)}
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
              <div className="tpl-preview-text">{renderFilled(previewTpl.bodyText ?? '', 'data')}</div>
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

      {/* ===== TEST SEND MODAL ===== */}
      <Modal
        isOpen={!!testTarget}
        onClose={() => setTestTarget(null)}
        title={`Test d'envoi — ${testTarget?.name ?? ''}`}
      >
        <div className="test-send-modal">
          <p className="test-send-hint">
            L&apos;email sera envoyé avec des <b>données de démonstration</b> (Jean Dupont, 250 000 €, immobilier).
            L&apos;objet sera préfixé par <code>[TEST]</code>.
          </p>
          <div className="test-send-field">
            <label>Adresse email du destinataire de test</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && testEmail.trim() && !testSending) handleTestSend(); }}
            />
          </div>
          {testResult && (
            <div className={`test-send-result ${testResult.ok ? 'ok' : 'err'}`}>
              <Icon name={testResult.ok ? 'check-circle' : 'alert-triangle'} size={16} />
              {testResult.msg}
            </div>
          )}
          <div className="test-send-actions">
            <button className="btn btn-ghost" onClick={() => setTestTarget(null)}>Fermer</button>
            <button
              className="btn btn-primary"
              onClick={handleTestSend}
              disabled={!testEmail.trim() || testSending}
            >
              {testSending ? 'Envoi en cours…' : 'Envoyer le test'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== ADHOC SEND MODAL (envoi ponctuel, destinataire hors CRM) ===== */}
      <Modal
        isOpen={!!adhocTarget}
        onClose={() => setAdhocTarget(null)}
        title={`Envoi ponctuel — ${adhocTarget?.name ?? ''}`}
      >
        <div className="test-send-modal">
          {/* ---- ÉTAPE 1 : destinataire + variables ---- */}
          {adhocStep === 1 && (
            <>
              <p className="test-send-hint">
                Envoi <b>réel</b> (sans préfixe [TEST]) à l&apos;adresse de votre choix — le destinataire
                n&apos;a pas besoin d&apos;être dans le CRM. Les variables du modèle (ex: {'{{prenom}}'},
                {' {{Message}}'}) sont remplies avec les informations ci-dessous ; les champs laissés
                vides restent vides dans l&apos;email.
              </p>
              <div className="test-send-field">
                <label>Adresse email du destinataire *</label>
                <input
                  type="email"
                  value={adhocTo}
                  onChange={(e) => setAdhocTo(e.target.value)}
                  placeholder="destinataire@exemple.com"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && adhocTo.trim()) setAdhocStep(2); }}
                />
              </div>
              <div className="adhoc-name-row">
                <div className="test-send-field">
                  <label>Prénom (optionnel)</label>
                  <input
                    type="text"
                    value={adhocFirstName}
                    onChange={(e) => setAdhocFirstName(e.target.value)}
                    placeholder="Marie"
                  />
                </div>
                <div className="test-send-field">
                  <label>Nom (optionnel)</label>
                  <input
                    type="text"
                    value={adhocLastName}
                    onChange={(e) => setAdhocLastName(e.target.value)}
                    placeholder="Dupont"
                  />
                </div>
              </div>
              <div className="test-send-field">
                <label>Message personnalisé (optionnel — inséré dans {'{{Message}}'})</label>
                <textarea
                  value={adhocMessage}
                  onChange={(e) => setAdhocMessage(e.target.value)}
                  placeholder="Texte libre injecté dans la variable {{Message}} du modèle…"
                  rows={3}
                />
              </div>
              <div className="test-send-actions">
                <button className="btn btn-ghost" onClick={() => setAdhocTarget(null)}>Annuler</button>
                <button
                  className="btn btn-primary"
                  onClick={() => setAdhocStep(2)}
                  disabled={!adhocTo.trim()}
                >
                  Continuer
                </button>
              </div>
            </>
          )}

          {/* ---- ÉTAPE 2 : édition ponctuelle du contenu ---- */}
          {adhocStep === 2 && (
            <>
              <p className="test-send-hint">
                Vérifiez et ajustez librement l&apos;objet et le contenu avant l&apos;envoi.
                <b> Rien n&apos;est enregistré dans le modèle</b> — les modifications ne valent
                que pour cet envoi{adhocTo ? <> vers <b>{adhocTo}</b></> : null}.
              </p>
              <div className="test-send-field">
                <label>Objet</label>
                <input
                  type="text"
                  value={adhocSubject}
                  onChange={(e) => setAdhocSubject(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="test-send-field">
                <div className="adhoc-field-head">
                  <label>
                    {adhocIsHtml ? 'Contenu HTML' : 'Contenu texte'}
                    <span className="field-hint" style={{ marginLeft: 6 }}>
                      (variables {'{{...}}'} interpolées à l&apos;envoi)
                    </span>
                  </label>
                  <div className="adhoc-view-toggle">
                    <span
                      className={adhocView === 'source' ? 'active' : ''}
                      onClick={() => { if (!adhocInlineEditing) setAdhocView('source'); }}
                    >
                      Source
                    </span>
                    <span
                      className={adhocView === 'preview' ? 'active' : ''}
                      onClick={() => { if (!adhocInlineEditing) setAdhocView('preview'); }}
                    >
                      Aperçu
                    </span>
                  </div>
                </div>

                {adhocView === 'source' ? (
                  <textarea
                    className={adhocIsHtml ? 'adhoc-editor-html' : ''}
                    value={adhocBody}
                    onChange={(e) => setAdhocBody(e.target.value)}
                    rows={12}
                  />
                ) : (
                  <div className="adhoc-preview-wrap">
                    <div className="adhoc-preview-toolbar">
                      {adhocInlineEditing ? (
                        <>
                          <span className="adhoc-preview-hint">
                            ✏️ Cliquez sur le texte dans l&apos;aperçu pour le modifier.
                            Les variables {'{{...}}'} restent intactes.
                          </span>
                          <button className="btn btn-ghost btn-sm" onClick={cancelAdhocInlineEditing}>
                            Annuler
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={applyAdhocInlineEdits}>
                            Appliquer
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="adhoc-preview-hint">
                            Aperçu avec les informations de l&apos;étape 1 (valeurs d&apos;exemple pour le reste).
                          </span>
                          {adhocIsHtml && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={startAdhocInlineEditing}
                              title="Modifier le contenu directement dans l'aperçu"
                            >
                              <Icon name="pencil" size={14} />
                              Modifier dans l&apos;aperçu
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {adhocPreviewDoc ? (
                      <iframe
                        ref={adhocIframeRef}
                        srcDoc={adhocInlineEditing ? adhocBody : adhocPreviewDoc}
                        title="Aperçu de l'email"
                        className="adhoc-preview-iframe"
                        onLoad={() => {
                          // designMode après chargement si l'édition vient d'être activée.
                          if (adhocInlineEditing) {
                            const iframe = adhocIframeRef.current;
                            if (iframe?.contentDocument) {
                              iframe.contentDocument.designMode = 'on';
                              iframe.contentWindow?.focus();
                            }
                          }
                        }}
                      />
                    ) : (
                      <div className="adhoc-preview-empty">Contenu vide.</div>
                    )}
                  </div>
                )}
              </div>
              {adhocResult && (
                <div className={`test-send-result ${adhocResult.ok ? 'ok' : 'err'}`}>
                  <Icon name={adhocResult.ok ? 'check-circle' : 'alert-triangle'} size={16} />
                  {adhocResult.msg}
                </div>
              )}
              <div className="test-send-actions">
                <button className="btn btn-ghost" onClick={() => setAdhocStep(1)} disabled={adhocSending}>
                  ← Retour
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleAdhocSend}
                  disabled={!adhocTo.trim() || !adhocSubject.trim() || !adhocBody.trim() || adhocSending}
                >
                  {adhocSending ? 'Envoi en cours…' : 'Envoyer l\'email'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}
