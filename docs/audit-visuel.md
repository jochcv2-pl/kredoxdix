# Audit Visuel + Responsive — Kredix

> Réalisé par **Vincent (Art Director)** + **Mia (UI/UX)** le 2026-07-22.
> Périmètre : `apps/web` (landing publique) + `apps/admin` (CRM 15 vues).
> Méthode : analyse statique du code (CSS, layouts, composants TSX). Aucune supposition — toutes les références renvoient à un fichier + numéro de ligne.

## Synthèse exécutive

| Métrique | apps/web (landing) | apps/admin (CRM) |
|---|---|---|
| Score visuel | **82/100** | **62/100** |
| Score responsive | **88/100** | **34/100** |
| Breakpoints | 5 (860, 768, 520, 480, 360) | **1 seul (1000px)** |
| Mobile-first | Non (desktop-first) mais compensé | **Non, et non compensé** |
| Burger / drawer mobile | Oui, animé + overlay plein écran | **Aucun** |
| A11y (focus, contraste) | Insuffisant | **Insuffisant + variables CSS cassées** |

- **Score global visuel : 70/100**
- **Score global responsive : 58/100**
- **Risques critiques : 7**

Le site public (`apps/web`) est **solide** : vraie stratégie responsive (multi-breakpoints, cibles tactiles 44px, prévention du zoom iOS, menu mobile plein écran). Le CRM (`apps/admin`) est **conçu pour desktop uniquement** : un seul breakpoint à 1000px, aucune adaptation téléphone, tables non scrollables, topbar qui déborde, sidebar qui ne se replie jamais complètement, et variables CSS référencées mais non définies qui cassent l'affichage.

## A. apps/web (landing page)

### A.1 Breakpoints existants

Stratégie **desktop-first** avec `max-width` queries (toutes dans `apps/web/app/globals.css`) :

| Breakpoint | Lignes | Rôle |
|---|---|---|
| `max-width: 860px` | L898-L923, L1001-L1048, L1053-L1066 | Principal : grilles → 1 colonne, menu caché + burger, cibles tactiles 44px |
| `max-width: 768px` | L939-L946 | Tablette : paddings hero/section réduits |
| `max-width: 520px` | L924-L931 | Petit mobile : stats 2 colonnes, grid2 → 1, boutons pleine largeur |
| `max-width: 480px` | L949-L983, L1069-L1079 | Cartes compactées, boutons sociaux colonne, menu `fixed` plein écran |
| `max-width: 360px` | L986-L994 | Ultra-petit : tailles de police minimales |
| `max-width: 860px landscape` | L1082-L1087 | Hero non écrasé en mode paysage |

**Viewport meta** : aucun `<meta name="viewport">` explicite dans `apps/web/app/layout.tsx` (L13-L28). Next.js injecte par défaut `width=device-width, initial-scale=1` → fonctionnel mais non maîtrisé (pas de `viewport-fit=cover` pour les notchs). **MINEUR**.

### A.2 Problèmes responsive identifiés

| # | Fichier / Ligne | Sévérité | Description | Recommandation |
|---|---|---|---|---|
| A1 | `app/layout.tsx` L15-L24 | **MAJEUR** | Polices `<link href="fonts.googleapis.com">` (Montserrat 6 poids) — **render-blocking**, pas d'optimisation mobile, pas de `font-display`. `apps/admin` utilise déjà `next/font`. | Migrer vers `next/font/google` avec `display:"swap"` + `subsets`. |
| A2 | `globals.css` L41 (`.wrap` max-width 1120px) | **MINEUR** | Conteneur fixé ; acceptable mais pas de `min()` fluide. | Conserver ; vérifier `scroll-padding-top: 76px` vs nav mobile ≈53px. |
| A3 | `globals.css` L70-L96 (`.nav-menu` + `.lang`) | **MINEUR** | 6 boutons langue côte à côte, serré à ≤360px (logo + CTA). | Envisager dropdown `<select>` langue sur mobile. |
| A4 | `globals.css` L298 (`.steps` grid 3 cols) | **OK** | Passé en 1 colonne via `@media 860px` (L903). | RAS. |
| A5 | `globals.css` L485-L490 (`.lead-grid`) + L769-L774 (`.contact-grid`) | **OK** | Grilles 2 cols → 1 colonne à 860px. | RAS. |
| A6 | `components/navbar.tsx` L56-L65 | **OK** | Burger `aria-label`, `aria-expanded`, animation croix, overlay plein écran ≤480px, scroll lock. Très bien fait. | RAS. |
| A7 | `globals.css` L383-L410 (`input[type=range]`) | **OK** | Sliders tactiles : piste 6px + thumb 21px, zone 28px sur mobile (L1003-L1016). Conforme WCAG 2.5.5. | RAS. |
| A8 | `globals.css` L1019-L1028 | **OK** | Inputs en `font-size:16px` sur mobile pour éviter zoom iOS au focus. | RAS. |
| A9 | Aucune règle `:focus-visible` | **MAJEUR** | Pas de style de focus clavier visible. Navigation clavier invisible. | Ajouter `:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }` global. |
| A10 | `globals.css` L255-L263, L416, L890 | **MAJEUR (a11y)** | Textes à **9-10px** — sous le seuil de lisibilité (12px min). | Monter à 11px min, idéalement 12px. |

### A.3 a11y visuelle

- **Contrastes insuffisants WCAG AA (4.5:1 requis)** :
  - `var(--slate-light) #94A3B8` sur blanc → **≈ 2.85:1 ❌**. Utilisé pour `.section-lead`, placeholders (`#CBD5E0` ≈ 1.7:1 ❌❌), `.slider-mm` (`#B4C4D6`), `.divider span`. **MAJEUR**.
  - `.hstat span` `rgba(255,255,255,0.6)` sur bleu → ≈ 3.2:1 ❌.
- **Focus clavier** : absent (voir A9).
- **Tailles de police** : multiples occurrences à 9-10px (A10).

## B. apps/admin (CRM)

### B.1 Breakpoints existants

**Un seul breakpoint dans tout le CRM** : `@media (max-width: 1000px)` (`globals.css` L34-L72, L81-L85, L114-L118, L267-L271, L672-L676, L1166-L1170, L1320-L1325, L1709-L1713). Un second isolé pour le login : `@media (max-width: 900px)` (L2322-L2326).

**Aucune media query pour `max-width: 768px` ou moins.** Le CRM n'est pas prévu pour tablette portrait ni téléphone. **Point noir de l'application.**

**Viewport meta** : non explicité dans `apps/admin/app/layout.tsx` (L18-L29). Valeur par défaut Next.js appliquée. **MINEUR**.

### B.2 Problèmes par vue / composant

#### B.2.1 Sidebar — `components/Sidebar.tsx` + `globals.css` L20-L72

| # | Ligne | Sévérité | Description | Recommandation |
|---|---|---|---|---|
| B1 | `globals.css` L20-L32 | **CRITIQUE** | `.sidebar` est `position: fixed; width: 236px`. À 1000px elle passe à `64px` (icônes seules) mais **ne disparaît jamais**. **Aucun hamburger / drawer** : `Sidebar.tsx` n'expose aucun état `open`. Sur téléphone, 64px sont **perdus en permanence** et la navigation par icônes seules est peu utilisable (15 vues). | Implémenter un drawer off-canvas à <768px : sidebar `transform: translateX(-100%)`, bouton burger dans la topbar, overlay + fermeture au clic. |

#### B.2.2 Topbar — `components/Topbar.tsx` + `globals.css` L88-L98, L444-L462

| # | Ligne | Sévérité | Description | Recommandation |
|---|---|---|---|---|
| B2 | `globals.css` L88-L98, L458-L462 | **CRITIQUE** | `.topbar` (`display:flex; justify-content:space-between`) et `.top-actions` (`display:flex; gap:12px`) **sans `flex-wrap` ni media query**. Topbar : titre + sous-titre à gauche, **« Exporter » + « + Nouveau dossier » + cloche + avatar** à droite (Topbar.tsx L116-L195). Sur ≤768px ça **déborde** ou écrase le titre. | À <768px : masquer libellés (icônes seules), `flex-wrap: wrap` sur `.top-actions`, réduire `padding: 16px 32px` → `12px 16px`. |
| B3 | `globals.css` L1820-L1823 | **MAJEUR** | `.view-content { padding: 28px 32px }` **sans media query**. Combiné à la sidebar fixe 64px, contenu très exigu sur mobile. | `padding: 16px` à <768px. |

#### B.2.3 Tables non scrollables

| # | Vue / Ligne | Sévérité | Description | Recommandation |
|---|---|---|---|---|
| B4 | `views/dashboard/page.tsx` L247 | **CRITIQUE** | `<table>` **sans conteneur `overflow-x:auto`**. Colonnes : Contact, Montant, Type, Statut → déborde sur mobile. | Envelopper dans `<div style={{overflowX:'auto'}}>`. |
| B5 | `views/contacts/page.tsx` L328 | **CRITIQUE** | `<table>` 7 colonnes **sans wrapper scrollable**. Colonne Action contient 2-3 boutons inline (L367-L408). | Wrapper scrollable + column hiding (Pays/Source). |
| B6 | `views/campaigns/page.tsx` L671, L849 | **CRITIQUE** | Deux `<table>` (historique 6 cols + destinataires) **sans wrapper**. | Wrapper `overflow-x:auto`. |
| B7 | `views/taux/page.tsx` L269, L306 | **MAJEUR** | Deux `<table>` **sans wrapper**. | Idem. |
| B8 | `views/dossiers/page.tsx` L145-L190 | **OK** | Table 8 colonnes **correctement** enveloppée dans `<div style={{overflowX:'auto'}}>`. | RAS — **reproduire ce pattern partout**. |
| B9 | `views/email-history/page.tsx` L161-L163 | **OK** | `.table-wrap { overflow-x: auto }` via `<style>` inline. | RAS. |

#### B.2.4 Grilles sans media query

| # | Fichier / Ligne | Sévérité | Description |
|---|---|---|---|
| B10 | `globals.css` L1327-L1331 (`.frow` grid 1fr 1fr) | **MINEUR** | Reste 2 colonnes sur mobile. |
| B11 | `globals.css` L1103-L1107 (`.tool-grid` 1fr 1fr) | **MINEUR** | Pas de media query. |
| B12 | `globals.css` L888-L910 (`.ae-tabs`) + L1248-L1265 (`.submenus`) | **MAJEUR** | `display:flex` **sans `flex-wrap`**. Onglets (Éditeur / Mode import, sous-menus emails) débordent horizontalement. | Ajouter `flex-wrap: wrap` + scroll horizontal. |

#### B.2.5 Composants `fixed` / `absolute`

| # | Ligne | Sévérité | Description |
|---|---|---|---|
| B13 | `globals.css` L20-L32 (`.sidebar fixed`) | **CRITIQUE** | Voir B1. |
| B14 | `globals.css` L1826-L1838 (`.modal-backdrop fixed`) | **OK** | Centrage flex + `padding:20px`. |
| B15 | `globals.css` L2333-L2344 (`.avatar-menu`) + L2433-L2445 (`.notif-dropdown`) | **CRITIQUE (notif)** | `.notif-dropdown` a `min-width: 340px; max-width: 380px` **sans media query**. Positionnée `right:0` en absolu. Sur **320-360px**, le dropdown **dépasse du bord gauche** → scroll horizontal de toute la page. | À <480px : `min-width: 0; width: calc(100vw - 32px); right: -8px`. |
| B16 | `globals.css` L1447-L1454 (`.preview sticky`) + L1663-L1670 (`.iframe-wrap`) | **OK** | Passées en `position: static` à 1000px (L67-L71). |
| B17 | `globals.css` L2076-L2083 (`.login-brand-footer absolute`) | **MINEUR** | Login brand caché à <900px (L2324), sans impact mobile. |

#### B.2.6 Login — `components/Login.tsx` + `globals.css` L1976-L2326

| # | Ligne | Sévérité | Description |
|---|---|---|---|
| B18 | `globals.css` L2322-L2326 | **OK** | `@media (max-width:900px)` : layout split → colonne, `.login-brand` caché, `.login-form-side width:100%`. Bonne adaptation. |
| B19 | `globals.css` L2086-L2095 (`.login-form-side width:520px`) | **MINEUR** | Largeur fixe 520px mais `width:100%` à <900px compense. RAS. |

### B.3 Composants partagés

| # | Composant / Ligne | Sévérité | Description |
|---|---|---|---|
| B20 | `components/Modal.tsx` + `globals.css` L1840-L1940 | **MINEUR** | `.modal max-width:500px; max-height:90vh`. Responsive correct. Variantes fullscreen `90vw` → OK. |
| B21 | `globals.css` L2918 (`.confirm-message color:var(--text)`) | **CRITIQUE (bug)** | **`var(--text)` non défini** dans `:root` (L5-L17 définit `--ink`, `--slate` mais **pas `--text`**). Message ConfirmDialog couleur indéterminée. |
| B22 | `globals.css` L2927-L2935 (`.set-input`) | **CRITIQUE (bug)** | Utilise `border:1px solid var(--border)`, `background:var(--white)`, `color:var(--text)` — **aucune variable existe**. Cadence éditable Settings sans bordure/fond prévisibles. Idem `<style>` inline vues clients/campaigns/domains (clients/page.tsx L138, L147, L156, L163, L210). | Définir alias dans `:root` : `--text:#0F172A; --border:#E7EBF0; --white:#fff; --danger:#B91C1C;`. |
| B23 | Aucune règle `:focus-visible` | **MAJEUR (a11y)** | Pas de style focus clavier cohérent. |

### B.4 a11y visuelle (admin)

- **Contrastes faibles** : `th` `var(--slate-light) #94A3B8` (L245) ≈ 2.85:1 ❌ ; `sb-group-label` `rgba(255,255,255,0.35)` sur `--blue-deep` (L369) ❌.
- **Tailles <12px** : `.sb-group-label` 9px (L365), `.lang-tag` 9px (L1754), `.tpl-var` 9px (L1789), `.badge` 10px (L155), `.field-hint` 11px.
- **Variables CSS cassées** : B21, B22.

## C. Recommandations priorisées

### P0 — CRITIQUE

1. **Sidebar mobile (B1)** : drawer off-canvas à <768px (translateX + overlay + burger dans la topbar). Actuellement 64px perdus en permanence et navigation par icônes seules inutilisable sur 15 vues.
2. **Topbar débordement (B2)** : `flex-wrap`, masquer libellés <768px, réduire padding.
3. **Tables non scrollables (B4, B5, B6, B7)** : envelopper les `<table>` dans `<div style={{overflowX:'auto'}}>` — reproduire le pattern de `dossiers/page.tsx` (L145).
4. **Dropdown notifications overflow (B15)** : `.notif-dropdown min-width:340px` provoque un scroll horizontal sur smartphones ≤360px. Rendre fluide <480px.
5. **Variables CSS cassées (B21, B22)** : `var(--text)`, `var(--border)`, `var(--white)`, `var(--danger)` non définies. Ajouter les alias dans `:root`.

### P1 — MAJEUR

6. **Fonts render-blocking sur le web (A1)** : migrer `apps/web` vers `next/font/google`.
7. **Focus visible (A9, B23)** : `:focus-visible` global sur les deux apps.
8. **Padding contenu admin (B3)** : `.view-content padding:28px 32px` sans media query → `16px` <768px.
9. **Onglets/submenus non wrappés (B12)** : `flex-wrap:wrap`.
10. **Contrastes WCAG AA** : revoir `--slate-light` (#94A3B8) sur fond clair → ≥4.5:1 (ex. `#64748B`).
11. **Tailles de police <11px** (A10, §B.4) : ≥12px.

### P2 — MINEUR

12. **Viewport meta explicite** (A, §B.1) : `viewport` (Next 15) avec `viewportFit:"cover"`.
13. **Sélecteur langue mobile web (A3)** : `<select>` à <360px.
14. **`.frow` / `.tool-grid`** (B10, B11) : 1 colonne <480px.
15. **`scroll-padding-top:76px`** (globals web L28) : ajuster à nav mobile (53px).

## D. Plan d'action responsive

### Stratégie cible (mobile-first à atteindre)

Adopter une grille de breakpoints cohérente **partagée par les deux apps** :

| Tranche | Breakpoint | Objectif |
|---|---|---|
| Mobile | `< 768px` | Layout 1 colonne, drawer, tables scrollables, cibles tactiles 44px, polices ≥16px sur inputs |
| Tablette | `768px – 1024px` | Grilles 2 colonnes, sidebar repliable |
| Desktop | `> 1024px` | Layout actuel (préservé — DEC-K1 respecté pour le web) |

### Actions concrètes (admin — la priorité)

1. **Refondre la coquille CRM** : `app/page.tsx` doit gérer un état `sidebarOpen` mobile + rendre un overlay. À <768px, `.sidebar { transform: translateX(-100%); transition: transform .25s }` et `.sidebar.open { transform:none }`.
2. **Rendre la topbar responsive** : `@media (max-width:768px){ .topbar{padding:12px 14px} .top-actions{flex-wrap:wrap;gap:8px} .topbar h1{font-size:16px} }`.
3. **Généraliser le wrapper de table** : composant `<ScrollTable>` ou wrapper div `overflow-x:auto` appliqué aux 6 tables (B4-B7).
4. **Fixer les variables CSS** : compléter `:root` (admin) avec `--text`, `--border`, `--white`, `--danger`.
5. **Ajouter un breakpoint 768px** couvrant : `.view-content`, `.notif-dropdown`, `.avatar-menu`, `.ae-tabs`, `.submenus`, `.frow`, `.kpi-grid`.

### Actions concrètes (web — ajustements)

1. Migrer Montserrat vers `next/font` (suppression du `<link>` bloquant).
2. Ajouter `:focus-visible` global.
3. Corriger les contrastes `--slate-light` et placeholders.

### Estimation

- **Admin** : refonte responsive (coquille + topbar + sidebar drawer + 6 tables + variables) = ~1.5 à 2 jours.
- **Web** : ajustements légers (~0.5 jour). L'architecture responsive existante est saine et sert de **référence** pour l'admin (pattern drawer + overlay + cibles tactiles à reproduire côté CRM).
