// =============================================================================
// email-blocks.tsx — Système de blocs pour l'éditeur visuel d'emails.
// =============================================================================
// Définit :
//   - Les types de blocs disponibles (texte, titre, bouton, image, CTA…)
//   - Les propriétés par défaut de chaque bloc
//   - Le sérialiseur HTML (table-based pour compatibilité email)
//   - Le rendu visuel de chaque bloc dans l'éditeur
//
// Le HTML généré utilise des <table> (standard email) compatible Gmail,
// Outlook, Apple Mail, Yahoo. Pas de flexbox, pas de grid, pas de CSS avancé.

import React from 'react';
import { Icon } from '@/components/Icon';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type BlockType =
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'cta-whatsapp'
  | 'cta-messenger'
  | 'cta-email'
  | 'cta-simulator'
  | 'social';

export interface BlockProps {
  // Common
  align?: 'left' | 'center' | 'right';
  padding?: string;
  bgColor?: string;
  textColor?: string;
  fontSize?: string;
  fontWeight?: string;
  // Heading & Text
  text?: string;
  lineHeight?: string;
  // Button & CTA
  buttonText?: string;
  buttonUrl?: string;
  buttonBg?: string;
  buttonTextColor?: string;
  buttonRadius?: string;
  buttonWidth?: 'auto' | 'full';
  // Image
  src?: string;
  alt?: string;
  imgWidth?: string;
  // Divider
  dividerColor?: string;
  dividerThickness?: string;
  dividerStyle?: 'solid' | 'dashed' | 'dotted';
  // Spacer
  height?: string;
  // Social
  socialFacebook?: string;
  socialInstagram?: string;
  socialLinkedin?: string;
  socialX?: string;
  // CTA-specific
  phoneNumber?: string;
  emailAddress?: string;
  messengerUrl?: string;
  simulatorUrl?: string;
  iconBg?: string;
}

export interface EmailBlock {
  id: string;
  type: BlockType;
  props: BlockProps;
}

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  category: 'content' | 'cta' | 'layout';
  defaultProps: BlockProps;
}

// -----------------------------------------------------------------------------
// Définitions des blocs
// -----------------------------------------------------------------------------

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    type: 'heading',
    label: 'Titre',
    icon: 'heading',
    category: 'content',
    defaultProps: {
      text: 'Votre titre ici',
      align: 'left',
      fontSize: '24px',
      fontWeight: '700',
      textColor: '#111827',
      padding: '16px 24px 8px',
    },
  },
  {
    type: 'text',
    label: 'Texte',
    icon: 'text',
    category: 'content',
    defaultProps: {
      text: 'Saisissez votre texte ici. Vous pouvez utiliser des variables comme {{Prénom}} pour personnaliser le message.',
      align: 'left',
      fontSize: '15px',
      textColor: '#374151',
      lineHeight: '1.6',
      padding: '8px 24px',
    },
  },
  {
    type: 'button',
    label: 'Bouton',
    icon: 'button',
    category: 'content',
    defaultProps: {
      buttonText: 'Cliquez ici',
      buttonUrl: 'https://',
      buttonBg: '#4f46e5',
      buttonTextColor: '#ffffff',
      buttonRadius: '8px',
      buttonWidth: 'auto',
      align: 'center',
      padding: '16px 24px',
    },
  },
  {
    type: 'image',
    label: 'Image',
    icon: 'image',
    category: 'content',
    defaultProps: {
      src: '',
      alt: 'Image',
      imgWidth: '100%',
      align: 'center',
      padding: '12px 24px',
    },
  },
  {
    type: 'divider',
    label: 'Séparateur',
    icon: 'divider',
    category: 'layout',
    defaultProps: {
      dividerColor: '#e5e7eb',
      dividerThickness: '1px',
      dividerStyle: 'solid',
      padding: '12px 24px',
    },
  },
  {
    type: 'spacer',
    label: 'Espacement',
    icon: 'spacer',
    category: 'layout',
    defaultProps: {
      height: '24px',
      padding: '0',
    },
  },
  {
    type: 'cta-whatsapp',
    label: 'WhatsApp',
    icon: 'whatsapp',
    category: 'cta',
    defaultProps: {
      buttonText: 'Discuter sur WhatsApp',
      phoneNumber: '+33 6 00 00 00 00',
      buttonBg: '#25D366',
      buttonTextColor: '#ffffff',
      buttonRadius: '8px',
      buttonWidth: 'full',
      align: 'center',
      padding: '12px 24px',
    },
  },
  {
    type: 'cta-messenger',
    label: 'Messenger',
    icon: 'messenger',
    category: 'cta',
    defaultProps: {
      buttonText: 'Contacter sur Messenger',
      messengerUrl: 'https://m.me/votre-page',
      buttonBg: '#0084FF',
      buttonTextColor: '#ffffff',
      buttonRadius: '8px',
      buttonWidth: 'full',
      align: 'center',
      padding: '12px 24px',
    },
  },
  {
    type: 'cta-email',
    label: 'Envoyer un email',
    icon: 'mail',
    category: 'cta',
    defaultProps: {
      buttonText: 'Répondre par email',
      emailAddress: 'contact@kredix.fr',
      buttonBg: '#6366f1',
      buttonTextColor: '#ffffff',
      buttonRadius: '8px',
      buttonWidth: 'full',
      align: 'center',
      padding: '12px 24px',
    },
  },
  {
    type: 'cta-simulator',
    label: 'Simulateur',
    icon: 'calculator',
    category: 'cta',
    defaultProps: {
      buttonText: 'Simuler mon prêt',
      simulatorUrl: 'https://kredix.fr',
      buttonBg: '#f59e0b',
      buttonTextColor: '#ffffff',
      buttonRadius: '8px',
      buttonWidth: 'full',
      align: 'center',
      padding: '12px 24px',
    },
  },
  {
    type: 'social',
    label: 'Réseaux sociaux',
    icon: 'globe',
    category: 'layout',
    defaultProps: {
      socialFacebook: '',
      socialInstagram: '',
      socialLinkedin: '',
      socialX: '',
      align: 'center',
      padding: '16px 24px',
    },
  },
];

export function getBlockDef(type: BlockType): BlockDefinition | undefined {
  return BLOCK_DEFINITIONS.find((b) => b.type === type);
}

export function createBlock(type: BlockType): EmailBlock {
  const def = getBlockDef(type)!;
  return {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    props: { ...def.defaultProps },
  };
}

// -----------------------------------------------------------------------------
// Sérialiseur HTML (table-based pour compatibilité email)
// -----------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildButtonHtml(
  text: string,
  url: string,
  bg: string,
  color: string,
  radius: string,
  width: 'auto' | 'full',
  align: 'left' | 'center' | 'right',
  padding: string,
): string {
  const widthStyle = width === 'full' ? 'width:100%;' : '';
  const alignVal = align === 'right' ? 'right' : align === 'left' ? 'left' : 'center';
  return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:${padding};">
    <tr><td align="${alignVal}">
      <table role="presentation" cellpadding="0" cellspacing="0" style="${widthStyle}display:inline-block;">
        <tr><td align="center" bgcolor="${bg}" style="border-radius:${radius};padding:14px 32px;">
          <a href="${esc(url)}" target="_blank" style="font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:${color};text-decoration:none;display:inline-block;">${esc(text)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

function buildSocialRow(label: string, url: string, color: string): string {
  if (!url) return '';
  const letter = label.charAt(0).toUpperCase();
  return `        <td align="center" style="padding:0 6px;">
          <a href="${esc(url)}" target="_blank" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:${color};color:#fff;border-radius:50%;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">${letter}</a>
        </td>`;
}

export function blockToHtml(block: EmailBlock): string {
  const p = block.props;
  switch (block.type) {
    case 'heading':
      return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:${p.padding || '16px 24px 8px'};font-family:Arial,sans-serif;font-size:${p.fontSize || '24px'};font-weight:${p.fontWeight || '700'};color:${p.textColor || '#111827'};text-align:${p.align || 'left'};line-height:1.3;">${esc(p.text || '')}</td></tr>
  </table>`;

    case 'text':
      return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:${p.padding || '8px 24px'};font-family:Arial,sans-serif;font-size:${p.fontSize || '15px'};color:${p.textColor || '#374151'};text-align:${p.align || 'left'};line-height:${p.lineHeight || '1.6'};">${esc(p.text || '').replace(/\n/g, '<br />')}</td></tr>
  </table>`;

    case 'button':
      return buildButtonHtml(
        p.buttonText || '', p.buttonUrl || '#',
        p.buttonBg || '#4f46e5', p.buttonTextColor || '#fff',
        p.buttonRadius || '8px', p.buttonWidth || 'auto',
        p.align || 'center', p.padding || '16px 24px',
      );

    case 'image':
      if (!p.src) return '';
      return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="${p.align || 'center'}" style="padding:${p.padding || '12px 24px'};">
      <img src="${esc(p.src)}" alt="${esc(p.alt || '')}" width="${parseInt(p.imgWidth || '600')}" style="max-width:100%;height:auto;border:0;display:block;" />
    </td></tr>
  </table>`;

    case 'divider':
      return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:${p.padding || '12px 24px'};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:${p.dividerThickness || '1px'} ${p.dividerStyle || 'solid'} ${p.dividerColor || '#e5e7eb'};font-size:0;line-height:0;">&nbsp;</td></tr></table>
    </td></tr>
  </table>`;

    case 'spacer':
      return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="height:${p.height || '24px'};line-height:${p.height || '24px'};font-size:0;">&nbsp;</td></tr>
  </table>`;

    case 'cta-whatsapp': {
      const phone = (p.phoneNumber || '').replace(/[^0-9+]/g, '');
      const url = `https://wa.me/${phone.replace('+', '')}`;
      return buildButtonHtml(p.buttonText || '', url, p.buttonBg || '#25D366', p.buttonTextColor || '#fff', p.buttonRadius || '8px', p.buttonWidth || 'full', p.align || 'center', p.padding || '12px 24px');
    }

    case 'cta-messenger':
      return buildButtonHtml(p.buttonText || '', p.messengerUrl || '', p.buttonBg || '#0084FF', p.buttonTextColor || '#fff', p.buttonRadius || '8px', p.buttonWidth || 'full', p.align || 'center', p.padding || '12px 24px');

    case 'cta-email': {
      const url = `mailto:${p.emailAddress || ''}`;
      return buildButtonHtml(p.buttonText || '', url, p.buttonBg || '#6366f1', p.buttonTextColor || '#fff', p.buttonRadius || '8px', p.buttonWidth || 'full', p.align || 'center', p.padding || '12px 24px');
    }

    case 'cta-simulator':
      return buildButtonHtml(p.buttonText || '', p.simulatorUrl || '#', p.buttonBg || '#f59e0b', p.buttonTextColor || '#fff', p.buttonRadius || '8px', p.buttonWidth || 'full', p.align || 'center', p.padding || '12px 24px');

    case 'social': {
      const socials: string[] = [];
      if (p.socialFacebook) socials.push(buildSocialRow('F', p.socialFacebook, '#1877F2'));
      if (p.socialInstagram) socials.push(buildSocialRow('I', p.socialInstagram, '#E4405F'));
      if (p.socialLinkedin) socials.push(buildSocialRow('L', p.socialLinkedin, '#0A66C2'));
      if (p.socialX) socials.push(buildSocialRow('X', p.socialX, '#000000'));
      if (!socials.length) return '';
      return `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="${p.align || 'center'}" style="padding:${p.padding || '16px 24px'};">
      <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;"><tr>
${socials.join('\n')}
      </tr></table>
    </td></tr>
  </table>`;
    }

    default:
      return '';
  }
}

/** Sérialise tous les blocs en un document HTML complet, prêt pour l'envoi. */
export function blocksToFullHtml(
  blocks: EmailBlock[],
  opts?: { subject?: string; bannerEnabled?: boolean; bannerUrl?: string },
): string {
  const body = blocks.map(blockToHtml).filter(Boolean).join('\n');
  const banner = opts?.bannerEnabled
    ? `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="background:#4f46e5;padding:20px;">
      <img src="${opts?.bannerUrl || 'https://kredix.fr/banner.png'}" alt="Kredix" style="max-width:200px;height:auto;border:0;" />
    </td></tr>
  </table>\n`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(opts?.subject || 'Email')}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
${banner}
${body}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Convertit les blocs en texte brut (pour bodyText). */
export function blocksToText(blocks: EmailBlock[]): string {
  return blocks
    .map((b) => {
      const p = b.props;
      switch (b.type) {
        case 'heading':
        case 'text':
          return p.text || '';
        case 'button':
        case 'cta-whatsapp':
        case 'cta-messenger':
        case 'cta-email':
        case 'cta-simulator':
          return `${p.buttonText}: ${p.buttonUrl || p.phoneNumber || p.emailAddress || p.messengerUrl || p.simulatorUrl || ''}`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

// -----------------------------------------------------------------------------
// Icônes (mapping pour le sidebar)
// -----------------------------------------------------------------------------

const BLOCK_ICON_PATHS: Record<string, React.ReactNode> = {
  heading: (<><path d="M6 4v16M18 4v16M6 12h12" /></>),
  text: (<><path d="M4 7h16M4 12h16M4 17h10" /></>),
  button: (<><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M8 12h8" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></>),
  divider: (<><line x1="3" y1="12" x2="21" y2="12" /></>),
  spacer: (<><line x1="3" y1="8" x2="21" y2="8" strokeDasharray="4 2" /><line x1="3" y1="16" x2="21" y2="16" strokeDasharray="4 2" /><path d="M12 9v6" strokeDasharray="2 2" /></>),
  whatsapp: (<><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2z" /><path d="M8.5 8.5c.3-.6 1-.6 1.4-.2l.8 1c.2.3.2.7 0 1l-.4.5a6 6 0 0 0 2.8 2.8l.5-.4c.3-.2.7-.2 1 0l1 .8c.4.4.4 1.1-.2 1.4-2.5 1.5-6-.2-7.1-3.1-.5-1.3-.3-2.8.2-3.8z" /></>),
  messenger: (<><path d="M12 2C6.5 2 2 6.2 2 11.4c0 2.9 1.4 5.5 3.6 7.2V22l3.3-1.8c1 .3 2 .4 3.1.4 5.5 0 10-4.2 10-9.4S17.5 2 12 2z" /><path d="M7.5 9.5l2.5 4 2.5-2 2 2 2.5-4" /></>),
  mail: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 6l10 7 10-7" /></>),
  calculator: (<><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="12" x2="8" y2="12" /><line x1="12" y1="12" x2="12" y2="12" /><line x1="16" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="12" y1="16" x2="12" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></>),
};

export function BlockIcon({ name, size = 18 }: { name: string; size?: number }) {
  const path = BLOCK_ICON_PATHS[name];
  if (!path) return <Icon name="button" size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}
