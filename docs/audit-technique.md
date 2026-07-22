# Audit Technique — Kredix

> Réalisé par **Max (Lead Developer)** le 2026-07-22.
> Périmètre : monorepo complet (`apps/web`, `apps/admin`, `packages/@kredix/*`).
> Stack : Next.js 15.1.6 + TypeScript + Tailwind v4 + PostgreSQL + Prisma 6 + NextAuth v5.

## Synthèse exécutive

- **Score global : 60/100**
- **Dette technique : Moyenne (proche d'Élevée)** — architecture générale saine et propre, mais failles structurelles sur l'authentification des routes API et SEO technique inexistant pèsent lourd.
- **Points critiques : 3** (faille d'autorisation sur routes admin, exposition de PII via API publique, fuite de secrets `apiKey` via endpoints non protégés).
- **Points forts** : monorepo pnpm/turbo bien structuré, TypeScript strict partout, validation Zod systématique, helpers API mutualisés, schéma Prisma commenté, Server Components sur le site public.

| Domaine | Note | Statut |
|---|---|---|
| A. Structure monorepo | 16/20 | ✅ Solide |
| B. TypeScript | 13/15 | ✅ Strict, peu de `any` |
| C. Routes API (sécurité/qualité) | 7/20 | 🔴 Critique |
| D. Schéma Prisma | 12/15 | 🟡 Bon mais FK manquantes |
| E. Duplication de code | 8/10 | 🟡 1 duo dupliqué majeur |
| F. Performance | 6/10 | 🟡 Polices, CSR |
| G. SEO technique | 4/15 | 🔴 sitemap/robots/hreflang absents |
| H. Accessibilité | 8/10 | 🟡 Sémantique partielle |
| I. Dette technique | 6/15 | 🟡 TODOs + config morte |

## A. Structure monorepo

**`pnpm-workspace.yaml`** (L1-5) — workspaces corrects : `apps/*`, `packages/*`, `packages/@kredix/*`.

**Versions (cohérence)** :
- `next` 15.1.6 — pin exact (sans `^`) côté `apps/web/package.json:19` et `apps/admin/package.json:19`. ✅
- `react`/`react-dom` 19.1.0 — pin exact, cohérent.
- `@types/react` forcé à `19.1.0` via `overrides` pnpm. ✅
- `typescript` `^5.7.0` partout. ✅
- `zod` `^3.24.0` dans les deux apps. ✅
- `@prisma/client` : `^6.19.3` dans les apps (devDeps), `^6.0.0` dans `@kredix/db`. 🟡 **Décalage mineur** — risque de divergence du client généré.

**Alias** : `@/*` → `./*` (OK dans les 2 apps). `@kredix/*` → workspace (OK).

**Anomalies structurelles** :
1. 🔴 **`@kredix/config` est une dépendance morte.** Déclarée dans les 2 apps mais **jamais utilisée** : les `tsconfig.json` étendent `../../tsconfig.base.json` (racine) et non `@kredix/config/tsconfig/base.json`. Les `.eslintrc.json` étendent `next/core-web-vitals` directement. Code mort.
2. 🔴 **`@kredix/ui` référencé mais inexistant.** `apps/web/next.config.ts:9` déclare `experimental.optimizePackageImports: ["@kredix/ui"]` — **aucun package `@kredix/ui`** n'existe. Option sans effet / bug latent.
3. 🟡 **`tsconfig.base.json` active `declaration: true`** (racine L17), neutralisé par `apps/admin/tsconfig.json:17` (`declaration: false`). Incohérence.

**Verdict structure** : monorepo propre côté versions runtime ; mais deux packages/références fantômes (`@kredix/config`, `@kredix/ui`).

## B. TypeScript

- **Strict mode : ✅ OK.** `strict: true` + `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` dans `tsconfig.base.json:9-13`.
- **`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` : 0 occurrence.** ✅
- **`any` explicites : 4** :
  - `apps/admin/views/campaigns/page.tsx:117` — `function mapCampaign(raw: any)`
  - `apps/admin/views/campaigns/page.tsx:179` — `json.data.map((t: any) => ...)`
  - `apps/admin/views/campaigns/page.tsx:217` — `.map((r: any) => ...)`
  - `packages/@kredix/db/prisma/seed.ts:967` — `prisma.lead.create({ data: lead as any })`
- **`as any` : 1** — `apps/admin/components/Topbar.tsx:45` `(window as any).webkitAudioContext` (justifiable).
- **`as unknown as` : 3** — SEO cast, fbq/gtag typé, singleton Prisma (patterns corrects).

**Types manquants** :
- Webhook email parse le body via `body as { event?: string; email?: string }` sans Zod (`apps/web/app/api/webhooks/email/route.ts:59`).
- `Record<string, unknown>` pour where Prisma puis casté (`status as LeadStatus`) — perd la sécurité de type.
- `z.record(z.any())` pour `config` de gateway (`apps/admin/app/api/gateways/route.ts:16`).

**Verdict TypeScript** : très bon niveau. Strict mode respecté. Les `any` restants sont concentrés dans la vue campagnes et le seed.

## C. Routes API

**Inventaire** : 4 routes côté `web`, 43 routes côté `admin` (47 au total).

### C.1 Validation Zod — couverture

- **Web** : `simulate` et `leads (POST)` validés via Zod (`apps/web/app/api/validators.ts`). ✅ `unsubscribe` (GET token) et `webhook` font une validation manuelle. 🟡 Le webhook **n'utilise pas Zod** (`apps/web/app/api/webhooks/email/route.ts:59`).
- **Admin** : helper `parseBody()` + schémas Zod sur quasi toutes les routes POST/PATCH. ✅

### C.2 Gestion d'erreurs / codes HTTP

- Helpers `successResponse`/`errorResponse` mutualisé **deux fois** (web : `validators.ts:97-120` ; admin : `_lib/responses.ts:11-28`). 🟡 Duplication.
- Codes corrects : 400/404/409/422/500 bien employés. ✅
- `try/catch` systématique. ✅

### C.3 🔴 SÉCURITÉ — failles d'autorisation (P0)

**Le matcher du middleware admin est incomplet** (`apps/admin/middleware.ts:25-37`). Il ne protège que : `/api/admin/*`, `/api/profile/*`, `/api/settings/*`, `/api/leads/*`, `/api/agents/*`, `/api/banks/*`, `/api/rates/*` — **plus 3 routes qui n'existent pas** (`/api/lead-templates/*`, `/api/contact-links/*`, `/api/pay-rates/*`).

**Routes admin SENSIBLES complètement non protégées** (absentes du matcher → accessibles sans authentification) :

| Route | Risque | Fichier |
|---|---|---|
| `/api/gateways` + `/[id]` | 🔴 **Expose `apiKey`** (Resend/Brevo/SMTP) — `findMany` sans `select` renvoie toute la ligne | `apps/admin/app/api/gateways/route.ts:23` |
| `/api/templates` + `/[id]` | Création/modif/suppression templates email | `apps/admin/app/api/templates/route.ts:37` |
| `/api/campaigns` (+ `/[id]/send`, `/cancel`) | 🔴 **Déclenchement envoi masse** sans auth | `apps/admin/app/api/campaigns/route.ts:82` |
| `/api/document-templates` (+ `/upload`) | Upload fichiers arbitraires | `apps/admin/app/api/document-templates/upload/route.ts:24` |
| `/api/clients` + `/[id]/send-level` | Exposition données clients + envoi emails | `apps/admin/app/api/clients/route.ts:37` |
| `/api/email-logs` | Lecture historique email (PII) | `apps/admin/app/api/email-logs/route.ts` |
| `/api/legal-pages` + `/[id]` | Modification contenu juridique | `apps/admin/app/api/legal-pages/route.ts` |
| `/api/domains` + `/[id]` | CRUD domaines/marques | `apps/admin/app/api/domains/route.ts` |
| `/api/cms/upload`, `/api/cms/rename` | Upload/renommage médias | `apps/admin/app/api/cms/upload/route.ts` |

**Routes protégées par secret dédié** (correct) : `/api/cron/relance` (CRON_SECRET).

### C.4 RBAC (rôles) quasi-absent

`requireAdmin()` (vérification `role === 'admin'`) n'est implémenté **que dans `/api/admin/users`**. Aucune route ne vérifie le rôle `viewer`/`advisor`. Un `viewer` (lecture seule prévu par `AdminRole`, `schema.prisma:57-61`) peut donc écrire partout via l'API.

### C.5 🔴 API publique qui expose des PII (web)

`GET /api/leads` sur l'app **web** est **publique** et renvoie noms, téléphones, montants, etc. (`apps/web/app/api/leads/route.ts:11-70`). Commentaire l'admet : *« Sera protégé par Zitadel en Phase 3. Pour l'instant, accessible sans auth pour les tests »* (ligne 8-9). **Fuite de données personnelles** sur le site public.

### C.6 Rate limiting absent

Aucune route publique n'a de rate limiting (`/api/leads` POST, `/api/simulate`, `/api/unsubscribe`). Commentaires le mentionnent (« rate limiting à ajouter en production », `apps/web/app/api/leads/route.ts:76`).

## D. Schéma Prisma

**`packages/@kredix/db/prisma/schema.prisma`** — 17 modèles, 11 enums. Schéma très bien documenté.

### D.1 Indexes — bonne couverture globale

- `Lead` : indexes sur `status`, `[assignedToId, status]`, `[sequenceActive, nextRelanceAt]`, `exitReason` (L185-191). ✅
- `EmailLog`, `Campaign`, `CampaignRecipient`, `Rate`, `AgentMemory`, `LegalPage`, `DocumentTemplate` : indexes présents. ✅

### D.2 🟡 Indexes manquants

- **`Lead.email`** : interrogé en `contains` (recherche, `leads/route.ts:80`) **sans index**. Envisager un index ou `pg_trgm`.
- **`Lead.phone`** : recherché en `contains` (`leads/route.ts:81`) sans index.
- **`CampaignRecipient`** : seul `@@index([campaignId, status])` ; pas d'index sur `leadId` ou `email` pour reporting.

### D.3 🔴 Relations sans contrainte FK / cascade

Plusieurs `leadId` sont **plain `String` sans `@relation`** → pas de FK, pas de cascade, risque d'orphelins :

- **`ClientStep.leadId`** (L520) — plain `String`, aucune relation. La route clients le confirme : *« La relation Lead → ClientStep n'est pas déclarée côté Prisma »* (`clients/route.ts:7-8`). Supprimer un lead laisse des `ClientStep` orphelins.
- **`EmailLog.leadId`** (L470) — plain `String` → orphelins au delete.
- **`CampaignRecipient.leadId`** (L438) — plain `String?` → orphelins.
- **`SuppressionList.leadId`** (L380) — plain `String?` (traçabilité seule — acceptable).

### D.4 Contraintes uniques

- `BankPartner.slug/name` ✅, `Rate [bankId, loanType, amountMin, amountMax]` ✅, `ClientStep [leadId, level]` ✅.
- 🟡 **`EmailGateway` « un seul actif »** est une contrainte applicative (transaction, `gateways/route.ts:40-48`) — pas DB. Une contrainte SQL partielle (`UNIQUE ... WHERE isActive`) serait plus robuste.
- 🟡 **`Setting.value`** : `String` sans longueur ; plusieurs `category` sans enum.

### D.5 Types String trop larges

- `Lead.firstName/lastName/phone/city/loanType/employmentStatus` : `String` sans `@db.VarChar(n)` (L128-148). Validation Zod côté app mais **rien côté base**.

## E. Duplication de code

### E.1 🔴 Duo `email-sender` + `template-interpolation` (TODO marqué)

Confirmé explicitement : `apps/web/app/api/_lib/email-ack.ts:5-7` :
> *« TODO(@kredix/email): Les helpers email-sender + template-interpolation sont actuellement dupliqués entre apps/admin et apps/web. À extraire dans un package `@kredix/email` partagé. »*

- **`sendEmail()`** — Admin : `apps/admin/app/api/_lib/email-sender.ts:49-71` (190 lignes). Web : `apps/web/app/api/_lib/email-ack.ts:105-176`. **~90% identique**.
- **`interpolate` / `interpolateTemplate`** — Admin : `template-interpolation.ts:55-78`. Web : `email-ack.ts:62-80`. **Tables quasi identiques**.
- **`textToHtml`** — `template-interpolation.ts:93-106` vs `email-ack.ts:82-91`. Quasi identique.
- **`formatEuro`** — dupliquée à l'identique.
- **`LOAN_TYPE_LABELS`** — même objet littéral dans les deux.

### E.2 🟡 Enveloppe de réponse API dupliquée

`successResponse`/`errorResponse`/`ApiSuccess`/`ApiErrorResponse` en **deux exemplaires** : `apps/web/app/api/validators.ts:84-120` et `apps/admin/app/api/_lib/responses.ts:8-28`.

### E.3 🟡 Pattern `useEffect` + `fetch` + `setState` répété x15

Toutes les vues admin reproduisent le même scaffolding (ex. `views/contacts/page.tsx:144`, `views/dashboard/page.tsx:128`). Aucun hook shared (`useApi`, SWR, React Query). ~73 appels `fetch` éparpillés. Forte redondance.

## F. Performance

### F.1 🔴 Polices sans `next/font`

`apps/web/app/layout.tsx:15-24` charge Montserrat via `<link>` Google Fonts. **Anti-pattern Next.js** : requêtes bloquantes, pas de self-hosting, CLS/FCP dégradés. L'admin utilise déjà `next/font/google` correctement.

### F.2 🟡 CSR massif côté admin

Les **15 vues admin sont toutes des Client Components** qui `fetch` en `useEffect` au montage. Pour listes read-only (dashboard, email-history, domains), un Server Component éviterait le waterfall « HTML → JS → fetch → render ».

Le site **public** fait l'inverse et bien : `apps/web/app/[locale]/page.tsx:20` est un Server Component qui précharge en SSR. ✅

### F.3 Images

🟡 2 usages de `<img>` au lieu de `next/image` : `apps/admin/components/EmailHeader.tsx:12` et `apps/admin/views/emails/page.tsx:95`. Contexte email (partiellement justifiable).

### F.4 Requêtes N+1

- `apps/admin/app/api/clients/route.ts:39-64` : 2 requêtes groupées (leads puis steps) au lieu d'un `include`. 🟡
- Le cron relance fait des requêtes individuelles par lead dans la boucle (`cron/relance/route.ts:117-241`) : jusqu'à ~400 requêtes. Un préchargement en batch diviserait par ~100. 🟡

### F.5 `console.log` en production

5 `console.log`/`debug` dans le code d'envoi (`client-level-sender.ts:256`, `campaign-sender.ts:134,145,272`, `cron/relance/route.ts:211`). 🟡 Devraient être derrière un flag ou un vrai logger.

## G. SEO technique

🔴 **Section globalement défaillante pour un site multilingue public.**

| Élément | Présent ? | Détail |
|---|---|---|
| `sitemap.ts` | ❌ **Absent** | Aucun `sitemap.ts`/`sitemap.xml` dans `apps/web`. |
| `robots.ts` | ❌ **Absent** | Aucun `robots.ts`/`robots.txt`. Le toggle `seo_robots_index` existe en DB mais n'alimente **aucun** robots.txt. |
| `generateMetadata` | 🟡 Partiel | `[locale]/layout.tsx:12` génère `title`/`description`/`icons`. **Mais ignore la locale** (`void locale;` L19) → pas de métadonnées localisées. |
| `hreflang` / `alternates` | ❌ **Absent** | Aucune balise `alternates.languages` pour les 6 locales. |
| Canonical | ❌ **Absent** | Pas d'URL canonique. |
| Structured data (JSON-LD) | ❌ **Absent** | Aucun `<script type="application/ld+json">` pour `FinancialProduct`/`Organization`. |
| `<html lang>` | ❌ **Absent** | `apps/web/app/layout.tsx:13` : `<html>` **sans `lang`**. 🔴 Néfaste SEO et a11y. |
| Open Graph / Twitter | ❌ **Absent** | Pas de `openGraph`/`twitter` dans `generateMetadata`. |

**Conclusion SEO** : pour un courtier crédit visant 6 marchés linguistiques, l'absence de sitemap, robots, hreflang, canonical et structured data est un **bloquant SEO majeur**.

## H. Accessibilité (a11y)

### H.1 ✅ Points positifs

- Navbar sémantique : `<header>` + `<nav>` (`navbar.tsx:35,40`). ✅
- Burger avec `aria-label` + `aria-expanded` (`navbar.tsx:58-59`). ✅
- SVG décoratifs avec `aria-hidden`. ✅
- `alt` présents sur les rares images. ✅
- Gestion du scroll lock à l'ouverture du menu mobile. ✅

### H.2 🟡 Manques

- 🔴 **`<html>` sans `lang`** (cf. G) — impact a11y direct.
- **Pas de `<main>`** sur la landing (`[locale]/page.tsx`) — enchaîne `<section>` sans landmark `<main>`. `footer` présent mais pas de `main`. 🟡
- **Boutons/liens CTA sans `aria-label`** contextuel (footer `page.tsx:246-248` liens morts `#`).
- **Focus management** : menu mobile gère scroll mais pas le **focus trap** ni le retour de focus à la fermeture. 🟡
- **Modale admin** (`Modal.tsx`) : pas de `role="dialog"`/`aria-modal` visible.

## I. Dette technique

### I.1 TODO / FIXME / HACK

- **3 marqueurs explicites** :
  - `apps/web/app/api/_lib/email-ack.ts:5` — `TODO(@kredix/email)` duplication.
  - `packages/@kredix/db/prisma/seed.ts:559` — commentaire `// 6 slots fixes` incohérent (seed crée 6 + 7 = 13 templates).
  - Commentaires « Phase 3 / futur » : *« Sera protégé par Zitadel en Phase 3 »* (`apps/web/app/api/leads/route.ts:8`).

### I.2 Code mort / références fantômes

- 🔴 `@kredix/config` (package entier inutilisé).
- 🔴 `@kredix/ui` (référence inexistante dans `next.config.ts:9`).
- 🔴 **3 routes fantômes dans le matcher middleware** (`/api/lead-templates`, `/api/contact-links`, `/api/pay-rates` — `middleware.ts:31,35,36`) ne correspondant à aucun fichier route.
- 🟡 `void NextResponse;` (`leads/[id]/route.ts:112`) — import inutile.
- 🟡 `void locale;` (`[locale]/layout.tsx:19`) — paramètre sciemment ignoré.

### I.3 Tests

- ✅ 1 fichier de test : `packages/@kredix/simulator/tests/calc.test.ts` (Vitest configuré).
- 🔴 **Aucun test** côté `apps/web` ni `apps/admin`. 0 couverture sur routes API, schéma, helpers email.

### I.4 Dette de secrets (seed)

- `seed.ts:341` : password démo `admin123` bcrypt cost 10. Commentaire : *« En production, l'admin changera ce mot de passe »*. 🟡
- `.env` locaux faibles (`WEBHOOK_EMAIL_SECRET="kredix-webhook-dev-secret"`). **Gitignorés** ✅.
- `gateways` seedés **sans `apiKey`** ✅.

## J. Recommandations priorisées

### P0 — CRITIQUE (sécurité, à traiter immédiatement)

1. **Corriger le matcher du middleware admin** pour couvrir **toutes** les routes sensibles : `/api/templates`, `/api/gateways`, `/api/campaigns`, `/api/document-templates`, `/api/clients`, `/api/email-logs`, `/api/legal-pages`, `/api/domains`, `/api/cms/*`. Supprimer les 3 routes fantômes. *Fichier : `apps/admin/middleware.ts`.*
2. **Masquer `apiKey` dans les réponses `/api/gateways`** : `select` sans `apiKey` sur `gateways/route.ts:23` et `[id]/route.ts:26`. Actuellement les clés API Resend/Breivo/SMTP fuient.
3. **Protéger `GET /api/leads` côté web** : retirer l'accès public ou restreindre à usage interne authentifié (`apps/web/app/api/leads/route.ts:11`). Exposition de PII sur le site public.

### P1 — MAJEUR

4. **Déclarer les relations Prisma manquantes** pour `ClientStep.leadId`, `EmailLog.leadId`, `CampaignRecipient.leadId` (L438, L470, L520) → ajout de `@relation` + `onDelete` + migration. Élimine orphelins et active `include`.
5. **Mettre en place le RBAC** : extraire `requireAdmin()` en helper réutilisable et l'appliquer sur toutes les routes d'écriture ; distinguer `advisor`/`viewer`.
6. **Valider le webhook email avec Zod** au lieu du cast `as {...}` (`apps/web/app/api/webhooks/email/route.ts:59`).
7. **SEO de base** : créer `apps/web/app/sitemap.ts` + `robots.ts` ; ajouter `alternates.languages` (hreflang ×6) et `canonical` dans `generateMetadata` ; ajouter JSON-LD `Organization`/`FinancialService`.
8. **Mettre `lang` sur `<html>`** : déplacer la balise `<html>` dans `[locale]/layout.tsx` avec `lang={locale}`.
9. **Migrer les polices vers `next/font/google`** (`apps/web/app/layout.tsx:15-24`) pour self-hosting et FCP/CLS.
10. **Extraire `@kredix/email`** (package shared) pour le duo `sendEmail` + `interpolateTemplate` + `textToHtml`, supprimant la duplication web/admin.

### P2 — MINEUR

11. **Supprimer les références mortes** : `@kredix/ui` dans `next.config.ts:9` ; évaluer `@kredix/config` (câbler ou supprimer).
12. **Nettoyer les `any`** restants : typer `mapCampaign` et les `map` de `campaigns/page.tsx:117,179,217` ; remplacer `lead as any` du seed.
13. **Ajouter des tests** : intégration sur routes API critiques, unitaires sur `email-sender`/`interpolateTemplate`.
14. **Factoriser le scaffolding admin** : hook `useApi` (ou SWR/React Query) pour éliminer la duplication des `useEffect`+`fetch`.
15. **Optimiser le cron relance** : pré-charger templates (3) et SuppressionList en batch.
16. **Aligner la version `@prisma/client`** entre apps (`^6.19.3`) et `@kredix/db` (`^6.0.0`).
17. **Renseigner les longueurs `@db.VarChar`** sur `Lead` courts (firstName/lastName/phone/city).
18. **Ajouter du rate limiting** sur endpoints publics.
19. **Landmark `<main>`** sur la landing + focus trap sur le menu mobile.
