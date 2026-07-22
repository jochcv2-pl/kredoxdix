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
FROM node:20-alpine AS base
# curl est utile pour les healthchecks; on garde l'image légère alpine.
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
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4 — runner
# Image finale, minimale. On ne copie QUE le strict nécessaire pour exécuter
# apps/web en mode standalone : .next/standalone + .next/static + public.
# Exécution en non-root (user nextjs fourni par l'image node).
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
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
