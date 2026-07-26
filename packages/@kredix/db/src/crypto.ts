// =============================================================================
// crypto.ts — Chiffrement symétrique AES-256-GCM pour secrets au repos.
// =============================================================================
// Module partagé (@kredix/db) — utilisé par apps/admin ET packages/@kredix/ai,
// packages/@kredix/email pour chiffrer/déchiffrer les secrets stockés en DB.
//
// Clé de chiffrement (par ordre de priorité) :
//   1. ENCRYPTION_KEY  — clé dédiée au chiffrement au repos (recommandée en prod)
//   2. AUTH_SECRET      — clé de session NextAuth (fallback backward-compat)
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

function getPrimaryKey(): Buffer {
  return getDecryptionKeys()[0];
}

function tryDecryptWithKey(
  encrypted: string,
  key: Buffer,
): string | null {
  const parts = encrypted.split(':');
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
    return null;
  }
}

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

  throw new Error(
    'Déchiffrement échoué : aucune clé valide ne permet de déchiffrer ce secret. ' +
    'Vérifiez ENCRYPTION_KEY / AUTH_SECRET ou les données peuvent être corrompues.',
  );
}
