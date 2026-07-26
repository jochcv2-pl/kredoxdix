// Re-export depuis @kredix/db — le code canonique vit dans le package partagé.
// Ce fichier existe pour backward compat avec les imports existants dans apps/admin.
export { encryptSecret, decryptSecret } from '@kredix/db';
