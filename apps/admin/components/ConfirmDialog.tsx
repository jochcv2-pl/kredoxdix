'use client'

import { type ReactNode } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'

// =============================================================================
// ConfirmDialog — modale de confirmation réutilisable pour actions sensibles.
// =============================================================================
// Variants :
//   - "danger"  (rouge)   → suppressions, actions irréversibles
//   - "warning" (orange)  → validations importantes (changement de statut)
//   - "info"    (bleu)    → confirmations neutres
//
// Usage :
//   <ConfirmDialog
//     isOpen={!!deleteTarget}
//     variant="danger"
//     title="Supprimer l'agent"
//     message="Cette action est irréversible. L'agent et toutes ses mémoires seront supprimés."
//     confirmLabel="Supprimer définitivement"
//     onConfirm={() => handleDelete()}
//     onClose={() => setDeleteTarget(null)}
//   />
// =============================================================================

type ConfirmVariant = 'danger' | 'warning' | 'info'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  onConfirm: () => void
  onClose: () => void
}

const VARIANT_COLORS: Record<ConfirmVariant, string> = {
  danger: 'var(--red)',
  warning: 'var(--orange, #E67E22)',
  info: 'var(--blue, #3B82F6)',
}

const VARIANT_ICONS: Record<ConfirmVariant, string> = {
  danger: 'alert-triangle',
  warning: 'alert-circle',
  info: 'info',
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="confirm-dialog">
        <div className="confirm-icon" style={{ color: VARIANT_COLORS[variant] }}>
          <Icon name={VARIANT_ICONS[variant]} size={32} />
        </div>
        <div className="confirm-message">{message}</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            className="btn btn-primary"
            style={{ background: VARIANT_COLORS[variant] }}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
