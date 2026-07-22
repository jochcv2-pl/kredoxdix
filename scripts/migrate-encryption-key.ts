// =============================================================================
// migrate-encryption-key.ts
// =============================================================================
// Script de migration : re-chiffre tous les secrets 2FA TOTP en DB avec
// ENCRYPTION_KEY au lieu de AUTH_SECRET.
//
// Pré-requis :
//   1. Définir ENCRYPTION_KEY dans .env ( openssl rand -base64 32 )
//   2. AUTH_SECRET doit toujours être présent (pour déchiffrer les anciens secrets)
//
// Usage :
//   npx tsx scripts/migrate-encryption-key.ts
//
// Ce script :
//   - Lit tous les AdminUser dont twoFactorSecret commence par "enc:"
//   - Déchiffre avec la clé actuelle (essaie ENCRYPTION_KEY puis AUTH_SECRET)
//   - Re-chiffre avec ENCRYPTION_KEY (clé primaire)
//   - Met à jour la DB
//   - Affiche un rapport détaillé
//
// Il est idempotent : si un secret est déjà chiffré avec ENCRYPTION_KEY,
// le re-chiffrement produit un résultat identique fonctionnellement (mais
// avec un nouvel IV aléatoire — le ciphertext change mais le plaintext non).
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// --- Import dynamique des fonctions crypto depuis le module admin ---
// On réimplémente ici plutôt que d'importer (évite les soucis de résolution
// de path tsconfig). La logique est identique à apps/admin/lib/crypto.ts.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function getDecryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey) keys.push(deriveKey(encKey));
  const authSecret = process.env.AUTH_SECRET;
  if (authSecret) keys.push(deriveKey(authSecret));
  if (keys.length === 0) {
    throw new Error('ENCRYPTION_KEY ou AUTH_SECRET manquant dans l\'environnement.');
  }
  return keys;
}

function tryDecryptWithKey(enc: string, key: Buffer): string | null {
  const parts = enc.split(':');
  if (parts.length !== 4) return null;
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const ciphertext = Buffer.from(parts[3], 'base64');
  const decipher = require('crypto').createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const { randomBytes, createCipheriv } = require('crypto');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`;
}

async function main() {
  console.log('=== Migration ENCRYPTION_KEY ===\n');

  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERREUR : ENCRYPTION_KEY n\'est pas défini dans l\'environnement.');
    console.error('Définissez ENCRYPTION_KEY avant de lancer ce script.');
    process.exit(1);
  }

  if (!process.env.AUTH_SECRET) {
    console.error('ERREUR : AUTH_SECRET n\'est pas défini.');
    console.error('AUTH_SECRET est nécessaire pour déchiffrer les anciens secrets.');
    process.exit(1);
  }

  console.log('ENCRYPTION_KEY : configuré ✓');
  console.log('AUTH_SECRET    : configuré ✓ (pour déchiffrement legacy)\n');

  const primaryKey = deriveKey(process.env.ENCRYPTION_KEY);
  const legacyKey = deriveKey(process.env.AUTH_SECRET);

  // Vérifier que les deux clés sont différentes (sinon pas besoin de migrer).
  if (primaryKey.equals(legacyKey)) {
    console.log('ENCRYPTION_KEY et AUTH_SECRET produisent la même clé dérivée.');
    console.log('Aucune migration nécessaire — les secrets utilisent déjà cette clé.\n');
    return;
  }

  // Récupérer tous les admins avec un secret chiffré.
  const admins = await prisma.adminUser.findMany({
    where: {
      twoFactorSecret: { startsWith: 'enc:' },
    },
    select: { id: true, email: true, twoFactorSecret: true },
  });

  console.log(`Admins avec 2FA activée : ${admins.length}\n`);

  if (admins.length === 0) {
    console.log('Aucun secret à migrer. ✓\n');
    return;
  }

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (const admin of admins) {
    const enc = admin.twoFactorSecret!;
    const plaintext = tryDecryptWithKey(enc, primaryKey);

    if (plaintext !== null) {
      // Déjà chiffré avec ENCRYPTION_KEY — skip.
      alreadyMigrated++;
      continue;
    }

    // Essayer avec l'ancienne clé (AUTH_SECRET).
    const legacyPlaintext = tryDecryptWithKey(enc, legacyKey);

    if (legacyPlaintext === null) {
      console.error(`  ✗ ${admin.email} (${admin.id}) — impossible à déchiffrer avec les deux clés. SECRET CORROMPU.`);
      failed++;
      continue;
    }

    // Re-chiffrer avec ENCRYPTION_KEY.
    const newEncrypted = encryptWithKey(legacyPlaintext, primaryKey);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorSecret: newEncrypted },
    });
    console.log(`  ✓ ${admin.email} — migré`);
    migrated++;
  }

  console.log('\n=== Rapport ===');
  console.log(`Total traités : ${admins.length}`);
  console.log(`Migrés        : ${migrated}`);
  console.log(`Déjà migrés   : ${alreadyMigrated}`);
  console.log(`Échecs        : ${failed}`);

  if (failed > 0) {
    console.log('\n⚠️  Certains secrets n\'ont pas pu être migrés.');
    console.log('   Ces admins devront réactiver leur 2FA manuellement.');
    process.exit(1);
  }

  console.log('\n✓ Migration terminée avec succès.');
  console.log('   Vous pouvez maintenant rotater AUTH_SECRET sans casser les 2FA.');
}

main()
  .catch((err) => {
    console.error('Erreur fatale :', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
