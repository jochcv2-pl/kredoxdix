import { Icon } from './Icon'

export interface EmailFooterData {
  brand: string
  brandAccent: string
  phone: string
  email: string
  orias: string
  legal: string
  link1: string
  link2: string
  link3: string
}

export const DEFAULT_FOOTER: EmailFooterData = {
  brand: 'Kredix',
  brandAccent: 'x',
  phone: '+33 1 00 00 00 00',
  email: 'conseiller@kredix.fr',
  orias: 'ORIAS 00000000',
  legal: "Kredix — Courtier en financement, intermédiaire en opération de banque et en services de paiement. Inscription ORIAS n°00000000 (www.orias.fr). Garantie et responsabilité professionnelle souscrites auprès d'une compagnie accréditée. Capital social : 100 000 €.",
  link1: 'Désinscription',
  link2: 'Mentions légales',
  link3: 'Politique de confidentialité',
}

interface EmailFooterProps {
  data?: Partial<EmailFooterData>
}

export function EmailFooter({ data = {} }: EmailFooterProps) {
  const d = { ...DEFAULT_FOOTER, ...data }
  return (
    <div className="email-footer">
      <div className="email-footer-brand">{d.brand}<span>{d.brandAccent}</span></div>
      <div className="email-footer-contact">
        <span><Icon name="phone" size={13} /> {d.phone}</span>
        <span><Icon name="mail" size={13} /> {d.email}</span>
        <span><Icon name="award" size={13} /> {d.orias}</span>
      </div>
      <div className="email-footer-legal">
        {d.legal}<br />
        <a>{d.link1}</a> · <a>{d.link2}</a> · <a>{d.link3}</a>
      </div>
    </div>
  )
}
