'use client';

// =============================================================================
// EmailBlockEditor.tsx — Éditeur visuel d'emails par blocs (drag-and-drop).
// =============================================================================
// Architecture :
//   [Sidebar]     → palette de blocs (cliquer pour ajouter ou glisser)
//   [Canvas]      → liste de blocs réordonnables (@dnd-kit/sortable)
//   [Props Panel] → panneau de propriétés du bloc sélectionné
//   [Preview]     → rendu HTML iframe (desktop / mobile)
//
// L'état (blocks[]) est géré par le parent. Le parent appelle onChange()
// à chaque modification et peut sérialiser via blocksToFullHtml().

import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  EmailBlock,
  BlockType,
  BlockProps,
  BLOCK_DEFINITIONS,
  createBlock,
  getBlockDef,
  blocksToFullHtml,
  BlockIcon,
} from '@/lib/email-blocks';
import { Icon } from '@/components/Icon';

// -----------------------------------------------------------------------------
// SortableBlock — un bloc dans le canvas (glissable)
// -----------------------------------------------------------------------------

function SortableBlock({
  block,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const def = getBlockDef(block.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`eb-block ${isSelected ? 'eb-block-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="eb-block-toolbar" {...attributes} {...listeners}>
        <span className="eb-block-grip"><Icon name="chevron-down" size={14} /></span>
        <span className="eb-block-type">
          <BlockIcon name={def?.icon || 'text'} size={14} />
          {def?.label || block.type}
        </span>
        <span className="eb-block-actions">
          <button
            type="button"
            className="eb-block-btn"
            title="Dupliquer"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          >
            <Icon name="copy" size={14} />
          </button>
          <button
            type="button"
            className="eb-block-btn eb-block-btn-danger"
            title="Supprimer"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>
      <div className="eb-block-content">
        <BlockPreview block={block} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// BlockPreview — rendu visuel d'un bloc dans l'éditeur
// -----------------------------------------------------------------------------

function BlockPreview({ block }: { block: EmailBlock }) {
  const p = block.props;
  switch (block.type) {
    case 'heading':
      return (
        <div style={{
          padding: p.padding,
          fontSize: p.fontSize,
          fontWeight: p.fontWeight as any,
          color: p.textColor,
          textAlign: p.align as any,
          fontFamily: 'Arial, sans-serif',
        }}>
          {p.text || 'Titre vide'}
        </div>
      );
    case 'text':
      return (
        <div style={{
          padding: p.padding,
          fontSize: p.fontSize,
          color: p.textColor,
          textAlign: p.align as any,
          lineHeight: p.lineHeight as any,
          fontFamily: 'Arial, sans-serif',
          whiteSpace: 'pre-wrap',
        }}>
          {p.text || 'Texte vide'}
        </div>
      );
    case 'button':
    case 'cta-whatsapp':
    case 'cta-messenger':
    case 'cta-email':
    case 'cta-simulator':
      return (
        <div style={{ padding: p.padding, textAlign: p.align as any }}>
          <span style={{
            display: p.buttonWidth === 'full' ? 'block' : 'inline-block',
            width: p.buttonWidth === 'full' ? '100%' : 'auto',
            background: p.buttonBg,
            color: p.buttonTextColor,
            borderRadius: p.buttonRadius,
            padding: '14px 32px',
            fontSize: '15px',
            fontWeight: 600,
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
          }}>
            {p.buttonText || 'Bouton'}
          </span>
        </div>
      );
    case 'image':
      return (
        <div style={{ padding: p.padding, textAlign: p.align as any }}>
          {p.src ? (
            <img src={p.src} alt={p.alt || ''} style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} />
          ) : (
            <div className="eb-image-placeholder">
              <Icon name="image" size={32} />
              <span>Aucune image — saisir une URL</span>
            </div>
          )}
        </div>
      );
    case 'divider':
      return (
        <div style={{ padding: p.padding }}>
          <div style={{
            borderTop: `${p.dividerThickness} ${p.dividerStyle} ${p.dividerColor}`,
          }} />
        </div>
      );
    case 'spacer':
      return (
        <div style={{ height: p.height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="eb-spacer-label">Espace: {p.height}</span>
        </div>
      );
    case 'social': {
      const items: { letter: string; color: string }[] = [];
      if (p.socialFacebook) items.push({ letter: 'F', color: '#1877F2' });
      if (p.socialInstagram) items.push({ letter: 'I', color: '#E4405F' });
      if (p.socialLinkedin) items.push({ letter: 'L', color: '#0A66C2' });
      if (p.socialX) items.push({ letter: 'X', color: '#000' });
      return (
        <div style={{ padding: p.padding, textAlign: p.align as any }}>
          {items.length === 0 ? (
            <span className="eb-spacer-label">Configurer les liens</span>
          ) : (
            <div style={{ display: 'inline-flex', gap: '12px' }}>
              {items.map((s, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: '50%', background: s.color,
                  color: '#fff', fontWeight: 700, fontSize: 14,
                }}>{s.letter}</span>
              ))}
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// PropsPanel — panneau de propriétés du bloc sélectionné
// -----------------------------------------------------------------------------

function PropsPanel({
  block,
  onUpdate,
}: {
  block: EmailBlock | null;
  onUpdate: (id: string, props: Partial<BlockProps>) => void;
}) {
  if (!block) {
    return (
      <div className="eb-props-empty">
        <Icon name="settings" size={32} />
        <p>Sélectionnez un bloc pour modifier ses propriétés</p>
      </div>
    );
  }

  const p = block.props;
  const set = (key: keyof BlockProps, value: string) => onUpdate(block.id, { [key]: value });

  const renderCommon = () => (
    <>
      <div className="eb-prop-row">
        <label>Alignement</label>
        <select value={p.align || 'left'} onChange={(e) => set('align', e.target.value)}>
          <option value="left">Gauche</option>
          <option value="center">Centre</option>
          <option value="right">Droite</option>
        </select>
      </div>
      <div className="eb-prop-row">
        <label>Padding interne</label>
        <input type="text" value={p.padding || ''} onChange={(e) => set('padding', e.target.value)} placeholder="16px 24px" />
      </div>
    </>
  );

  const renderTextProps = () => (
    <>
      <div className="eb-prop-row eb-prop-row-full">
        <label>{block.type === 'heading' ? 'Titre' : 'Texte'}</label>
        {block.type === 'text' ? (
          <textarea rows={5} value={p.text || ''} onChange={(e) => set('text', e.target.value)} />
        ) : (
          <input type="text" value={p.text || ''} onChange={(e) => set('text', e.target.value)} />
        )}
      </div>
      <div className="eb-prop-row">
        <label>Taille police</label>
        <input type="text" value={p.fontSize || ''} onChange={(e) => set('fontSize', e.target.value)} placeholder="15px" />
      </div>
      <div className="eb-prop-row">
        <label>Couleur texte</label>
        <div className="eb-color-input">
          <input type="color" value={p.textColor || '#374151'} onChange={(e) => set('textColor', e.target.value)} />
          <input type="text" value={p.textColor || ''} onChange={(e) => set('textColor', e.target.value)} />
        </div>
      </div>
      {block.type === 'heading' && (
        <div className="eb-prop-row">
          <label>Graisse</label>
          <select value={p.fontWeight || '700'} onChange={(e) => set('fontWeight', e.target.value)}>
            <option value="400">Normal</option>
            <option value="600">Semi-gras</option>
            <option value="700">Gras</option>
            <option value="800">Extra-gras</option>
          </select>
        </div>
      )}
      {block.type === 'text' && (
        <div className="eb-prop-row">
          <label>Hauteur ligne</label>
          <input type="text" value={p.lineHeight || ''} onChange={(e) => set('lineHeight', e.target.value)} placeholder="1.6" />
        </div>
      )}
      {renderCommon()}
    </>
  );

  const renderButtonProps = () => (
    <>
      <div className="eb-prop-row eb-prop-row-full">
        <label>Texte du bouton</label>
        <input type="text" value={p.buttonText || ''} onChange={(e) => set('buttonText', e.target.value)} />
      </div>
      {block.type === 'button' && (
        <div className="eb-prop-row eb-prop-row-full">
          <label>URL de destination</label>
          <input type="text" value={p.buttonUrl || ''} onChange={(e) => set('buttonUrl', e.target.value)} placeholder="https://" />
        </div>
      )}
      {block.type === 'cta-whatsapp' && (
        <div className="eb-prop-row eb-prop-row-full">
          <label>Numéro WhatsApp</label>
          <input type="text" value={p.phoneNumber || ''} onChange={(e) => set('phoneNumber', e.target.value)} placeholder="+33 6 00 00 00 00" />
        </div>
      )}
      {block.type === 'cta-messenger' && (
        <div className="eb-prop-row eb-prop-row-full">
          <label>URL Messenger</label>
          <input type="text" value={p.messengerUrl || ''} onChange={(e) => set('messengerUrl', e.target.value)} placeholder="https://m.me/votre-page" />
        </div>
      )}
      {block.type === 'cta-email' && (
        <div className="eb-prop-row eb-prop-row-full">
          <label>Email de destination</label>
          <input type="text" value={p.emailAddress || ''} onChange={(e) => set('emailAddress', e.target.value)} placeholder="contact@..." />
        </div>
      )}
      {block.type === 'cta-simulator' && (
        <div className="eb-prop-row eb-prop-row-full">
          <label>URL du simulateur</label>
          <input type="text" value={p.simulatorUrl || ''} onChange={(e) => set('simulatorUrl', e.target.value)} placeholder="https://" />
        </div>
      )}
      <div className="eb-prop-row">
        <label>Couleur fond</label>
        <div className="eb-color-input">
          <input type="color" value={p.buttonBg || '#4f46e5'} onChange={(e) => set('buttonBg', e.target.value)} />
          <input type="text" value={p.buttonBg || ''} onChange={(e) => set('buttonBg', e.target.value)} />
        </div>
      </div>
      <div className="eb-prop-row">
        <label>Couleur texte</label>
        <div className="eb-color-input">
          <input type="color" value={p.buttonTextColor || '#ffffff'} onChange={(e) => set('buttonTextColor', e.target.value)} />
          <input type="text" value={p.buttonTextColor || ''} onChange={(e) => set('buttonTextColor', e.target.value)} />
        </div>
      </div>
      <div className="eb-prop-row">
        <label>Arrondi bordure</label>
        <input type="text" value={p.buttonRadius || ''} onChange={(e) => set('buttonRadius', e.target.value)} placeholder="8px" />
      </div>
      <div className="eb-prop-row">
        <label>Largeur</label>
        <select value={p.buttonWidth || 'auto'} onChange={(e) => set('buttonWidth', e.target.value)}>
          <option value="auto">Auto</option>
          <option value="full">Pleine largeur</option>
        </select>
      </div>
      {renderCommon()}
    </>
  );

  const renderImageProps = () => (
    <>
      <div className="eb-prop-row eb-prop-row-full">
        <label>URL de l&apos;image</label>
        <input type="text" value={p.src || ''} onChange={(e) => set('src', e.target.value)} placeholder="https://" />
      </div>
      <div className="eb-prop-row eb-prop-row-full">
        <label>Texte alternatif</label>
        <input type="text" value={p.alt || ''} onChange={(e) => set('alt', e.target.value)} />
      </div>
      <div className="eb-prop-row">
        <label>Largeur (px)</label>
        <input type="text" value={p.imgWidth || '100%'} onChange={(e) => set('imgWidth', e.target.value)} />
      </div>
      {renderCommon()}
    </>
  );

  const renderDividerProps = () => (
    <>
      <div className="eb-prop-row">
        <label>Couleur</label>
        <div className="eb-color-input">
          <input type="color" value={p.dividerColor || '#e5e7eb'} onChange={(e) => set('dividerColor', e.target.value)} />
          <input type="text" value={p.dividerColor || ''} onChange={(e) => set('dividerColor', e.target.value)} />
        </div>
      </div>
      <div className="eb-prop-row">
        <label>Épaisseur</label>
        <input type="text" value={p.dividerThickness || '1px'} onChange={(e) => set('dividerThickness', e.target.value)} />
      </div>
      <div className="eb-prop-row">
        <label>Style</label>
        <select value={p.dividerStyle || 'solid'} onChange={(e) => set('dividerStyle', e.target.value)}>
          <option value="solid">Plein</option>
          <option value="dashed">Tirets</option>
          <option value="dotted">Pointillés</option>
        </select>
      </div>
      {renderCommon()}
    </>
  );

  const renderSpacerProps = () => (
    <div className="eb-prop-row">
      <label>Hauteur</label>
      <input type="text" value={p.height || '24px'} onChange={(e) => set('height', e.target.value)} />
    </div>
  );

  const renderSocialProps = () => (
    <>
      <div className="eb-prop-row eb-prop-row-full">
        <label>Facebook (URL)</label>
        <input type="text" value={p.socialFacebook || ''} onChange={(e) => set('socialFacebook', e.target.value)} placeholder="https://facebook.com/..." />
      </div>
      <div className="eb-prop-row eb-prop-row-full">
        <label>Instagram (URL)</label>
        <input type="text" value={p.socialInstagram || ''} onChange={(e) => set('socialInstagram', e.target.value)} placeholder="https://instagram.com/..." />
      </div>
      <div className="eb-prop-row eb-prop-row-full">
        <label>LinkedIn (URL)</label>
        <input type="text" value={p.socialLinkedin || ''} onChange={(e) => set('socialLinkedin', e.target.value)} placeholder="https://linkedin.com/..." />
      </div>
      <div className="eb-prop-row eb-prop-row-full">
        <label>X / Twitter (URL)</label>
        <input type="text" value={p.socialX || ''} onChange={(e) => set('socialX', e.target.value)} placeholder="https://x.com/..." />
      </div>
      {renderCommon()}
    </>
  );

  return (
    <div className="eb-props-panel">
      <div className="eb-props-header">
        <BlockIcon name={getBlockDef(block.type)?.icon || 'text'} size={16} />
        <span>{getBlockDef(block.type)?.label}</span>
      </div>
      <div className="eb-props-body">
        {block.type === 'heading' && renderTextProps()}
        {block.type === 'text' && renderTextProps()}
        {['button', 'cta-whatsapp', 'cta-messenger', 'cta-email', 'cta-simulator'].includes(block.type) && renderButtonProps()}
        {block.type === 'image' && renderImageProps()}
        {block.type === 'divider' && renderDividerProps()}
        {block.type === 'spacer' && renderSpacerProps()}
        {block.type === 'social' && renderSocialProps()}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Composant principal : EmailBlockEditor
// -----------------------------------------------------------------------------

export interface EmailBlockEditorProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  bannerEnabled?: boolean;
}

export function EmailBlockEditor({ blocks, onChange, bannerEnabled }: EmailBlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedBlock = blocks.find((b) => b.id === selectedId) || null;

  const addBlock = useCallback((type: BlockType) => {
    const newBlock = createBlock(type);
    onChange([...blocks, newBlock]);
    setSelectedId(newBlock.id);
  }, [blocks, onChange]);

  const deleteBlock = useCallback((id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [blocks, onChange, selectedId]);

  const duplicateBlock = useCallback((id: string) => {
    const original = blocks.find((b) => b.id === id);
    if (!original) return;
    const copy: EmailBlock = {
      ...original,
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      props: { ...original.props },
    };
    const idx = blocks.findIndex((b) => b.id === id);
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setSelectedId(copy.id);
  }, [blocks, onChange]);

  const updateBlock = useCallback((id: string, props: Partial<BlockProps>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...props } } : b)));
  }, [blocks, onChange]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(blocks, oldIdx, newIdx));
  }, [blocks, onChange]);

  const previewHtml = useMemo(() => {
    return blocksToFullHtml(blocks, { bannerEnabled });
  }, [blocks, bannerEnabled]);

  const contentBlocks = BLOCK_DEFINITIONS.filter((b) => b.category === 'content');
  const ctaBlocks = BLOCK_DEFINITIONS.filter((b) => b.category === 'cta');
  const layoutBlocks = BLOCK_DEFINITIONS.filter((b) => b.category === 'layout');

  if (showPreview) {
    return (
      <div className="eb-preview-wrap">
        <div className="eb-preview-bar">
          <button
            type="button"
            className={`eb-preview-tab ${previewMode === 'desktop' ? 'active' : ''}`}
            onClick={() => setPreviewMode('desktop')}
          >
            <Icon name="globe" size={16} /> Desktop
          </button>
          <button
            type="button"
            className={`eb-preview-tab ${previewMode === 'mobile' ? 'active' : ''}`}
            onClick={() => setPreviewMode('mobile')}
          >
            <Icon name="phone" size={16} /> Mobile
          </button>
          <button
            type="button"
            className="eb-preview-close"
            onClick={() => setShowPreview(false)}
          >
            Retour &agrave; l&apos;&eacute;diteur
          </button>
        </div>
        <div className={`eb-preview-container ${previewMode === 'mobile' ? 'eb-preview-mobile' : ''}`}>
          <iframe
            srcDoc={previewHtml}
            title="Preview"
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="eb-layout">
      {/* Sidebar — palette de blocs */}
      <aside className="eb-sidebar">
        <div className="eb-sidebar-section">
          <h4>Contenu</h4>
          <div className="eb-block-palette">
            {contentBlocks.map((def) => (
              <button
                key={def.type}
                type="button"
                className="eb-palette-item"
                onClick={() => addBlock(def.type)}
              >
                <BlockIcon name={def.icon} size={16} />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="eb-sidebar-section">
          <h4>CTA</h4>
          <div className="eb-block-palette">
            {ctaBlocks.map((def) => (
              <button
                key={def.type}
                type="button"
                className="eb-palette-item eb-palette-cta"
                onClick={() => addBlock(def.type)}
              >
                <BlockIcon name={def.icon} size={16} />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="eb-sidebar-section">
          <h4>Mise en page</h4>
          <div className="eb-block-palette">
            {layoutBlocks.map((def) => (
              <button
                key={def.type}
                type="button"
                className="eb-palette-item"
                onClick={() => addBlock(def.type)}
              >
                <BlockIcon name={def.icon} size={16} />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="eb-preview-toggle"
          onClick={() => setShowPreview(true)}
          disabled={blocks.length === 0}
        >
          <Icon name="play" size={16} /> Aperçu
        </button>
      </aside>

      {/* Canvas — liste triable de blocs */}
      <main className="eb-canvas">
        {blocks.length === 0 ? (
          <div className="eb-canvas-empty">
            <div className="eb-empty-icon">
              <Icon name="mail" size={40} />
            </div>
            <h3>Composez votre email</h3>
            <p>Glissez des blocs depuis la gauche ou démarrez rapidement :</p>
            <div className="eb-empty-quickstart">
              <button type="button" className="eb-quick-btn" onClick={() => addBlock('heading')}>
                <BlockIcon name="heading" size={18} />
                <span>Titre + Texte</span>
              </button>
              <button type="button" className="eb-quick-btn" onClick={() => addBlock('button')}>
                <BlockIcon name="button" size={18} />
                <span>Bouton CTA</span>
              </button>
              <button type="button" className="eb-quick-btn eb-quick-cta" onClick={() => addBlock('cta-whatsapp')}>
                <BlockIcon name="whatsapp" size={18} />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map((block) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  isSelected={selectedId === block.id}
                  onSelect={() => setSelectedId(block.id)}
                  onDelete={() => deleteBlock(block.id)}
                  onDuplicate={() => duplicateBlock(block.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </main>

      {/* Props panel — panneau coulissant à droite (overlay) */}
      {selectedBlock && (
        <aside className="eb-props eb-props-overlay">
          <div className="eb-props-inner">
            <button
              type="button"
              className="eb-props-close"
              onClick={() => setSelectedId(null)}
            >
              <Icon name="x" size={18} />
            </button>
            <PropsPanel block={selectedBlock} onUpdate={updateBlock} />
          </div>
        </aside>
      )}
    </div>
  );
}
