# Kredix

Courtier en financement. Compare 40 banques pour obtenir le meilleur taux de crédit.

## Stack

- **Monorepo** : pnpm 11 + Turborepo
- **Frontend** : Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- **Backend** : Next.js API Routes + Prisma + PostgreSQL
- **Auth** : NextAuth.js v5 (Credentials + bcrypt + 2FA TOTP)
- **Infra** : Docker Compose + Caddy + VPS Ubuntu

## Démarrage rapide (développement)

### Prérequis

- Node.js >= 20
- pnpm >= 11
- Docker + Docker Compose (pour PostgreSQL local)

### Installation

```bash
# 1. Cloner le dépôt
git clone <repo-url> kredix
cd kredix

# 2. Copier l'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Installer les dépendances
pnpm install

# 4. Démarrer la base de données
docker compose up -d postgres

# 5. Générer le client Prisma + migrations
pnpm db:generate
pnpm db:push

# 6. Lancer le serveur de développement
pnpm dev
```

L'app web est disponible sur http://localhost:3100 (admin sur http://localhost:3200).

## Structure du monorepo

```
kredix/
├── apps/
│   ├── web/          # Landing page publique (Next.js)
│   └── admin/        # Admin/CMS (Next.js, protégé NextAuth)
├── packages/
│   └── @kredix/
│       ├── types/    # Types TypeScript partagés
│       ├── simulator/# Logique simulateur de crédit
│       ├── email/    # Sender + templates + settings (multi-SMTP)
│       ├── ai/       # Client LLM (Ollama / OpenAI-compatible)
│       └── db/       # Prisma client + schéma + migrations
└── docs/             # Contexte projet (brand, design, etc.)
```

## Scripts

| Commande | Description |
|----------|-------------|
| `pnpm dev` | Démarrer tous les apps en mode dev |
| `pnpm build` | Build de production |
| `pnpm lint` | Linting |
| `pnpm typecheck` | Vérification des types |
| `pnpm db:generate` | Générer le client Prisma |
| `pnpm db:migrate` | Exécuter les migrations |
| `pnpm db:studio` | Ouvrir Prisma Studio |

## Documentation

Voir `docs/` pour le contexte projet (marque, design system, etc.).

## Licence

Propriétaire — © 2026 Kredix
