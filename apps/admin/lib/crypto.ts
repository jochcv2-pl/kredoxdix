// =============================================================================
// crypto.ts — Chiffrement symétrique AES-256-GCM pour secrets au repos.
// =============================================================================
// Utilisé pour chiffrer les secrets sensibles en DB (ex: twoFactorSecret).
// La clé est dérivée de AUTH_SECRET (variable d'environnement serveur) via SHA-256.
//
// Format du payload chiffré : "enc:<iv_hex>:<authTag_hex>:<ciphertext_base64>"
// Le préfixe "enc:" permet de distinguer les valeurs chiffrées des valeurs
// legacy en clair (migration transparente — voir decryptSecret).
//
// Ce module utilise le crypto natif Node.js (aucune dépendance externe).

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits (recommandé pour GCM)
const AUTH_TAG_LENGTH = 16;

/**
 * Dérive une clé 32 bytes depuis AUTH_SECRET via SHA-256.
 * Lance une erreur claire si AUTH_SECRET n'est pas configuré.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET manquant — impossible de chiffrer/déchiffrer les secrets. ' +
      'Définissez AUTH_SECRET dans le fichier .env de l\'admin.',
    );
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * Chiffre une chaîne avec AES-256-GCM.
 * @returns "enc:<iv_hex>:<authTag_hex>:<ciphertext_base64>"
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`;
}

/**
 * Déchiffre une valeur précédemment chiffrée par encryptSecret.
 *
 * BACKWARD COMPAT : si la valeur ne commence PAS par "enc:", elle est retournée
 * telle quelle (legacy plaintext). Cela permet une migration transparente des
 * secrets existants sans casser le login.
 *
 * @returns Le secret en clair, ou null si l'entrée est null.
 * @throws Error si le déchiffrement échoue (auth tag invalide = données altérées).
 */
export function decryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;

  // Legacy plaintext (avant chiffrement) — retourne tel quel.
  if (!encrypted.startsWith('enc:')) {
    return encrypted;
  }

  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  // Format : enc:<iv_hex>:<authTag_hex>:<ciphertext_base64>
  // parts[0] = "enc", parts[1] = iv, parts[2] = authTag, parts[3] = ciphertext
  if (parts.length !== 4) {
    throw new Error('Format de secret chiffré invalide');
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const ciphertext = Buffer.from(parts[3], 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
