// =============================================================================
// crypto.ts — Chiffrement symétrique AES-256-GCM pour secrets au repos.
// =============================================================================
// Utilisé pour chiffrer les secrets sensibles en DB (ex: twoFactorSecret).
//
// Clé de chiffrement (par ordre de priorité) :
//   1. ENCRYPTION_KEY  — clé dédiée au chiffrement au repos (recommandée en prod)
//   2. AUTH_SECRET      — clé de session NextAuth (fallback backward-compat)
//
// Séparation des préoccupations :
//   - AUTH_SECRET   → sessions JWT (NextAuth), rotation possible sans casser les 2FA
//   - ENCRYPTION_KEY → secrets chiffrés en DB (TOTP, etc.), rotation rare/stable
//
// Au déchiffrement : on essaie ENCRYPTION_KEY puis AUTH_SECRET pour permettre
// une migration transparente (secrets anciens déchiffrables avec l'ancienne clé).
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
 * Liste des clés de déchiffrement candidates, par ordre de priorité.
 *
 * 1. ENCRYPTION_KEY (si définie) — clé dédiée au chiffrement au repos.
 * 2. AUTH_SECRET (si défini)     — fallback backward-compat pour les secrets
 *    chiffrés avant l'introduction de ENCRYPTION_KEY.
 *
 * Au moins une des deux doit être présente, sinon erreur.
 */
function getDecryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];

  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey) {
    keys.push(createHash('sha256').update(encKey).digest());
  }

  const authSecret = process.env.AUTH_SECRET;
  if (authSecret) {
    keys.push(createHash('sha256').update(authSecret).digest());
  }

  if (keys.length === 0) {
    throw new Error(
      'ENCRYPTION_KEY ou AUTH_SECRET manquant — impossible de chiffrer/déchiffrer les secrets. ' +
      'Définissez ENCRYPTION_KEY (recommandé) ou AUTH_SECRET dans le fichier .env.',
    );
  }

  return keys;
}

/**
 * Clé primaire utilisée pour les nouveaux chiffrements.
 * Priorise ENCRYPTION_KEY, fallback sur AUTH_SECRET.
 */
function getPrimaryKey(): Buffer {
  return getDecryptionKeys()[0];
}

/**
 * Tente de déchiffrer avec une clé spécifique.
 * @returns Le plaintext ou null si l'auth tag ne correspond pas (mauvaise clé).
 */
function tryDecryptWithKey(
  encrypted: string,
  key: Buffer,
): string | null {
  const parts = encrypted.split(':');
  // Format : enc:<iv_hex>:<authTag_hex>:<ciphertext_base64>
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

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Auth tag invalide = mauvaise clé (ou données altérées).
    // On retourne null pour que l'appelant essaie la clé suivante.
    return null;
  }
}

/**
 * Chiffre une chaîne avec AES-256-GCM.
 * Utilise toujours la clé primaire (ENCRYPTION_KEY si définie, sinon AUTH_SECRET).
 *
 * @returns "enc:<iv_hex>:<authTag_hex>:<ciphertext_base64>"
 */
export function encryptSecret(plaintext: string): string {
  const key = getPrimaryKey();
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
 * BACKWARD COMPAT :
 *   1. Si la valeur ne commence PAS par "enc:" → legacy plaintext (retourné tel quel).
 *   2. Sinon, on essaie chaque clé candidate (ENCRYPTION_KEY, puis AUTH_SECRET)
 *      jusqu'à ce qu'une fonctionne. Cela permet une migration transparente :
 *      les secrets chiffrés avec AUTH_SECRET restent déchiffrables même après
 *      l'introduction de ENCRYPTION_KEY.
 *
 * @returns Le secret en clair, ou null si l'entrée est null.
 * @throws Error si aucune clé ne permet de déchiffrer (données corrompues/altérées).
 */
export function decryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;

  // Legacy plaintext (avant chiffrement) — retourne tel quel.
  if (!encrypted.startsWith('enc:')) {
    return encrypted;
  }

  const keys = getDecryptionKeys();

  for (const key of keys) {
    const result = tryDecryptWithKey(encrypted, key);
    if (result !== null) {
      return result;
    }
  }

  // Aucune clé n'a fonctionné — données corrompues ou clés invalides.
  throw new Error(
    'Déchiffrement échoué : aucune clé valide ne permet de déchiffrer ce secret. ' +
    'Vérifiez ENCRYPTION_KEY / AUTH_SECRET ou les données peuvent être corrompues.',
  );
}
