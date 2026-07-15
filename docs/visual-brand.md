# Visual Brand — Kredix

## Direction artistique (brief Vincent)

Kredix arbore une identité **financière moderne et accessible** : le sérieux du secteur bancaire avec la fraîcheur d'une néo-fintech.

### Principes directeurs
1. **Confiance par la sobriété** — pas de surcharge visuelle, beaucoup d'espace blanc
2. **Énergie par l'accent orange** — le bleu rassure, l'orange dynamise (CTA, highlights)
3. **Lisibilité absolue** — Montserrat, contrastes élevés, tailles généreuses
4. **Profondeur subtile** — dégradés doux, ombres légères, blobs décoratifs pour l'atmosphère

## Système chromatique

| Token | Hex | Usage |
|-------|-----|-------|
| `blue` | #2B8BDE | Primaire, liens, éléments interactifs |
| `blue-dark` | #1E6FB8 | Dégradés, hover |
| `blue-deep` | #155A99 | Dégradés profonds, hero |
| `orange` | #F97316 | CTA, accents, highlights |
| `orange-soft` | #FFF4E8 | Fonds clairs d'accent |
| `orange-border` | #FCD9B0 | Bordures claires d'accent |
| `ink` | #0F172A | Texte principal, sections sombres |
| `slate` | #64748B | Texte secondaire |
| `slate-light` | #94A3B8 | Texte tertiaire, placeholders |
| `line` | #E2E8F0 | Bordures, séparateurs |
| `line-soft` | #EDF2F7 | Bordures subtiles |
| `bg-soft` | #F8FAFC | Fonds de sections alternatifs |

### Répartition (règle 60-30-10)
- 60% Blanc + bleu (fonds, textes)
- 30% Bleu (structure, sections)
- 10% Orange (CTA, accents, stats clés)

## Typographie

**Police unique : Montserrat** (Google Fonts)
- Poids utilisés : 400 (corps), 500 (inputs), 600 (nav, labels), 700 (titres, boutons), 800 (h2, logo), 900 (h1)
- Anti-aliasing obligatoire (`-webkit-font-smoothing: antialiased`)

## Composants visuels clés

### Boutons
- **Orange (primaire)** : fond `#F97316`, padding généreux, border-radius 11px, ombre colorée orange
- **Ghost (secondaire)** : fond translucide blanc, bordure 1px, pour fonds sombres
- Hover : translation verticale -2px + ombre renforcée

### Cards
- Fond blanc, bordure 1px `#E2E8F0`, border-radius 14px, padding 26-28px
- Pas d'ombre par défaut sur les cards simples, ombre uniquement sur la card formulaire

### Sections sombres
- Hero : dégradé bleu 3 stops
- Contact : `#0F172A` (ink) plein
- Footer : `#0A0F1C` (presque noir)

## Décors atmosphériques

- **Blobs** : cercles flous en radial-gradient pour adoucir les angles du hero
- **Grid background** : lignes subtiles à 3.5% d'opacité, taille 46px, sur le hero
- **Dégradés doux** : background des sections simulateur (`#EBF5FF → #FFF8F0`)

## Iconographie

Pour l'instant : SVG inline uniquement (logo WhatsApp). Pas d'emoji.
Phase 1+ : remplacer par un set d'icônes cohérent (à brief par Léo).

---

_Ce document sera enrichi par Vincent au fil des missions design._
