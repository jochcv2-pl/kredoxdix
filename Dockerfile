# =============================================================================
# Kredix — Dockerfile multi-stage (monorepo pnpm + Turborepo + Next.js 15)
# =============================================================================
# IMPORTANT (Next.js standalone) :
# Pour que le stage "runner" fonctionne, le fichier apps/web/next.config.ts
# DOIT contenir :  output: 'standalone'
# Sans cela, le dossier .next/standalone n'est pas généré et le conteneur
# ne pourra pas démarrer via `node server.js`.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — base
# Image commune Node 20 + pnpm. Réutilisée comme base par les stages suivants.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base
# Node 22 requis : pnpm 11.9 utilise des builtin modules (ERR_UNKNOWN_BUILTIN_MODULE sur Node 20).
# libc6-compat pour les binaires natifs Prisma/sharp sous Alpine.
RUN apk add --no-cache libc6-compat \
    && corepack enable \
    && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2 — deps
# On NE copie QUE les fichiers de manifeste (package.json, lockfile, workspace)
# puis on lance pnpm install --frozen-lockfile.
# Objectif : maximiser le cache Docker. Tant que les deps ne changent pas,
# cette couche (la plus lourde) n'est pas reconstruite.
# -----------------------------------------------------------------------------
FROM base AS deps
# Fichiers de workspace à la racine.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
# Manifestes de tous les workspaces (apps + packages).
# On copie en respectant la structure pour que pnpm résolve le workspace.
COPY apps ./apps
COPY packages ./packages
# On retire le code source copié accidentellement (on ne garde que package.json).
# NOTE : le .dockerignore exclut déjà node_modules, .next, etc.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    PNPM_CONFIG_FETCH_TIMEOUT=600000 \
    PNPM_CONFIG_FETCH_RETRIES=8 \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 3 — builder
# Copie du code source complet + build Turborepo.
# Les NEXT_PUBLIC_* nécessaires au build (build-time) sont injectés ici.
# -----------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
# Variables d'environnement de build (Next.js inlines les NEXT_PUBLIC_*).
# Valeurs par défaut — surcharger via --build-arg en CI/prod.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# DATABASE_URL placeholder au build : PrismaClient valide le format à l'instanciation
# mais ne se connecte pas. Les pages force-dynamic ne touchent pas la DB au build.
# Les vraies requêtes DB échouent gracieusement (try/catch) et sont reportées au runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
# Génération du client Prisma AVANT le build Next.js (sinon @prisma/client absent).
RUN pnpm --filter @kredix/db db:generate
RUN pnpm build
# DEBUG: vérifier la structure du standalone généré
RUN echo "=== STANDALONE STRUCTURE ===" \
    && find /app/apps/web/.next/standalone -name "server.js" -type f \
    && echo "=== STANDALONE ROOT ===" \
    && ls -la /app/apps/web/.next/standalone/ \
    && echo "=== STANDALONE/apps/web ===" \
    && ls -la /app/apps/web/.next/standalone/apps/web/ 2>/dev/null || true

# -----------------------------------------------------------------------------
# Stage 4 — migrator
# Image one-shot qui applique les migrations Prisma au démarrage de la stack.
# Lancée avant web et admin (depends_on: service_completed_successfully).
# -----------------------------------------------------------------------------
FROM base AS migrator
WORKDIR /app
# node_modules depuis deps (contient prisma CLI + @prisma/client générés).
COPY --from=deps /app/node_modules ./node_modules
# Manifestes workspace racine (requis pour pnpm --filter).
COPY package.json pnpm-workspace.yaml ./
# Tous les packages — pnpm vérifie le workspace au runtime (depsStatusCheck).
# Ne copier que @kredix/db casse la résolution (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND).
COPY --from=deps /app/packages ./packages
# Le schema + les migrations doivent être présents pour migrate deploy.
COPY packages/@kredix/db/prisma ./packages/@kredix/db/prisma
ENV NODE_ENV=production
# DATABASE_URL est injectée au runtime via docker-compose (environment:).
CMD ["pnpm", "--filter", "@kredix/db", "exec", "prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"]

# -----------------------------------------------------------------------------
# Stage 5 — tools
# Image d'opérations (seed, scripts runtime comme migrate-encryption-key.ts).
# Utilisée via `docker compose run --rm tools pnpm db:seed` par exemple.
# -----------------------------------------------------------------------------
FROM base AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY scripts ./scripts
RUN pnpm --filter @kredix/db db:generate
ENV NODE_ENV=production
# Shell interactif par défaut — l'opérateur lance les commandes explicitement.
CMD ["bash"]

# -----------------------------------------------------------------------------
# Stage 6 — runner
# Image finale, minimale. On ne copie QUE le strict nécessaire pour exécuter
# apps/web en mode standalone : .next/standalone + .next/static + public.
# Exécution en non-root (user nextjs fourni par l'image node).
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Utilisateur non-root fourni par l'image node:20-alpine.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copie du build standalone (server.js + node_modules minimaux).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Assets statiques et publics (non inclus dans standalone).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck : ping /api/health toutes les 30s.
# Utilise fetch natif Node 20 (pas de curl/wget dans le runner minimal).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js est généré par Next.js standalone à la racine de apps/web.
CMD ["node", "apps/web/server.js"]
