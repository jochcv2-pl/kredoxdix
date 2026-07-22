// Re-export depuis @kredix/email — le code canonique vit dans le package partagé.
// Ce fichier existe pour backward compat avec les imports existants dans apps/admin.
export {
  sendEmail,
  type EmailAttachment,
  type SendEmailParams,
  type SendEmailResult,
} from '@kredix/email';
