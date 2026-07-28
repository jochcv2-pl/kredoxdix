# Kredix — Guide de déploiement VPS

## Prérequis

- VPS Ubuntu 22.04+ (ou Debian 12+) avec accès root/sudo
- 2 GB RAM minimum (4 GB recommandé)
- Docker Engine + Docker Compose v2 installés
- Ports 80 (HTTP) et 443 (HTTPS) ouverts dans le firewall
- 2 enregistrements DNS pointant vers l'IP du VPS :
  - `kredix.fr` → site public
  - `crm.kredix.fr` → CRM admin

## Étapes de déploiement

### 1. Cloner le projet

```bash
git clone <repo-url> /opt/kredix
cd /opt/kredix
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
nano .env
```

**Variables obligatoires à modifier :**

| Variable | Valeur | Description |
|----------|--------|-------------|
| `DOMAIN` | `kredix.fr` | Domaine du site public |
| `ADMIN_DOMAIN` | `crm.kredix.fr` | Sous-domaine du CRM admin |
| `POSTGRES_PASSWORD` | (générer un mot de passe fort) | Mot de passe de la base de données |
| `DATABASE_URL` | `postgresql://kredix:MOT_DE_PASSE@postgres:5432/kredix?schema=public` | Doit utiliser le même mot de passe que `POSTGRES_PASSWORD` |
| `AUTH_SECRET` | `openssl rand -base64 32` | Secret de session NextAuth |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` | Clé de chiffrement des secrets en DB |
| `CRON_SECRET` | `openssl rand -base64 32` | Protection des endpoints cron |
| `WEBHOOK_EMAIL_SECRET` | `openssl rand -base64 32` | Protection des webhooks email |
| `AI_API_KEY` | `sk-...` | Clé API OpenAI (ou laisser vide pour Ollama local) |
| `ACME_EMAIL` | `admin@kredix.fr` | Email pour les certificats Let's Encrypt |
| `NEXT_PUBLIC_APP_URL` | `https://kredix.fr` | URL publique du site |
| `NEXT_PUBLIC_ADMIN_URL` | `https://crm.kredix.fr` | URL publique du CRM |
| `NEXT_PUBLIC_SITE_URL` | `https://kredix.fr` | URL canonique (sitemap, robots) |

**Générer les secrets en une commande :**

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
echo "WEBHOOK_EMAIL_SECRET=$(openssl rand -base64 32)"
```

### 3. Démarrer la stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Le premier build prend 5-10 minutes. Les services démarrent dans l'ordre :
1. **postgres** (base de données)
2. **migrator** (applique les migrations Prisma, puis s'arrête)
3. **web** (site public, port 3000)
4. **admin** (CRM admin, port 3001)
5. **caddy** (reverse proxy + HTTPS automatique)
6. **backup** (sauvegardes automatiques PostgreSQL)

### 4. Vérifier le déploiement

```bash
# Statut des conteneurs
docker compose -f docker-compose.prod.yml ps

# Logs en temps réel
docker compose -f docker-compose.prod.yml logs -f web admin caddy

# Health checks
curl https://kredix.fr/api/health
curl https://crm.kredix.fr/api/health
```

### 5. Initialiser les données (seed)

```bash
docker compose -f docker-compose.prod.yml run --rm tools pnpm db:seed
```

Cela crée : l'utilisateur admin par défaut, les 5 agents IA, les templates email (FR + DE), les settings CMS, etc.

**Identifiants admin par défaut :** `admin@kredix.fr` / `Kredix2025!`

⚠️ **Changer le mot de passe admin immédiatement** après le premier login.

### 6. Configurer les crons (obligatoire)

Les crons sont **indispensables** au fonctionnement métier : sans eux, aucune relance automatique n'est envoyée et les campagnes en masse interrompues ne reprennent jamais.

```bash
sudo crontab -e
```

Ajouter les deux lignes suivantes :

```cron
# Toutes les 2 minutes — séquence d'emails (welcome T+5min + relances J+3/J+6/J+9)
*/2 * * * * curl -fsS -X POST -H "Authorization: Bearer VOTRE_CRON_SECRET" https://crm.kredix.fr/api/cron/relance >> /var/log/kredix-cron.log 2>&1

# Toutes les 5 minutes — reprend les campagnes en masse interrompues (envoi anti-spam)
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer VOTRE_CRON_SECRET" https://crm.kredix.fr/api/cron/campaign-resume >> /var/log/kredix-cron.log 2>&1
```

Remplacer `VOTRE_CRON_SECRET` par la valeur du `.env`.

Vérifier que les crons tournent :
```bash
# Vérifier que crontab est configuré
sudo crontab -l

# Vérifier les logs
tail -f /var/log/kredix-cron.log

# Test manuel d'un cron
curl -s -X POST -H "Authorization: Bearer VOTRE_CRON_SECRET" https://crm.kredix.fr/api/cron/relance
curl -s -X POST -H "Authorization: Bearer VOTRE_CRON_SECRET" https://crm.kredix.fr/api/cron/campaign-resume
```

## Changer le nom de domaine

Si le client veut utiliser un autre domaine (ex: `moncredit.fr` + `admin.moncredit.fr`) :

```bash
nano .env
# Modifier uniquement ces 2 lignes :
# DOMAIN=moncredit.fr
# ADMIN_DOMAIN=admin.moncredit.fr
# Et aussi :
# NEXT_PUBLIC_APP_URL=https://moncredit.fr
# NEXT_PUBLIC_ADMIN_URL=https://admin.moncredit.fr
# NEXT_PUBLIC_SITE_URL=https://moncredit.fr

docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy obtiendra automatiquement les nouveaux certificats SSL Let's Encrypt.

**Aucune modification de code nécessaire — tout est piloté par le `.env`.**

## Renommer la marque (nom du site)

Depuis le CRM admin :
1. Aller dans **Contenu du site (CMS)**
2. Section **Identité de marque**
3. Changer le nom → cliquer **"Appliquer le renommage global"**
4. Le nom est mis à jour partout : sidebar, login, site public, emails, footer

## Sauvegardes

Les sauvegardes PostgreSQL sont automatiques (toutes les 6h par défaut) :
- **Local** : volume Docker `kredix_backups` (7 quotidiens + 4 hebdomadaires)
- **Offsite** (optionnel) : configurer `RCLONE_REMOTE` dans le `.env`

Restaurer depuis un backup :

```bash
# Lister les backups
docker compose -f docker-compose.prod.yml exec backup ls /backups/daily/

# Restaurer
gunzip -c /backups/daily/kredix_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U kredix -d kredix
```

## Maintenance

### Mettre à jour le code

```bash
cd /opt/kredix
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

Le service `migrator` applique automatiquement les nouvelles migrations.

### Voir les logs

```bash
# Tous les services
docker compose -f docker-compose.prod.yml logs -f

# Service spécifique
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f admin
docker compose -f docker-compose.prod.yml logs -f backup
```

### Redémarrer un service

```bash
docker compose -f docker-compose.prod.yml restart web
docker compose -f docker-compose.prod.yml restart admin
docker compose -f docker-compose.prod.yml restart caddy
```

### Arrêter / démarrer la stack

```bash
docker compose -f docker-compose.prod.yml down      # Arrêter
docker compose -f docker-compose.prod.yml up -d     # Démarrer
```

## Configuration email (post-déploiement)

1. Se connecter au CRM admin
2. Aller dans **Configuration → Passerelles d'envoi**
3. Ajouter une passerelle (Resend / Brevo / SMTP) avec la clé API
4. Activer la passerelle (radio button)
5. Configurer l'adresse d'expédition (`from_email`) si différente du défaut
6. Tester l'envoi

## Configuration IA (post-déploiement)

1. Aller dans **Configuration → Modèle d'IA**
2. Configurer : modèle, moteur, endpoint, température, max tokens
3. Cliquer **"Tester la connexion"** pour vérifier
4. L'IA est utilisée automatiquement par l'Agent Relance pour personnaliser les emails

## Ports internes (non exposés)

| Service | Port interne | Exposé via |
|---------|-------------|------------|
| web | 3000 | Caddy (DOMAIN) |
| admin | 3001 | Caddy (ADMIN_DOMAIN) |
| postgres | 5432 | Réseau interne uniquement |

## Dépannage

### Caddy ne délivre pas les certificats SSL

- Vérifier que les DNS pointent vers la bonne IP
- Vérifier que les ports 80+443 sont ouverts
- Consulter les logs : `docker compose -f docker-compose.prod.yml logs caddy`

### La base de données ne démarre pas

- Vérifier `POSTGRES_PASSWORD` est non vide dans `.env`
- Le volume persistant peut être corrompu : `docker volume rm kredix_pgdata` (⚠️ perte de données)

### L'admin affiche "Redirection vers la connexion…" en boucle

- Vérifier `AUTH_SECRET` et `ENCRYPTION_KEY` sont identiques dans `.env`
- Vérifier que le migrator a terminé avec succès

### Les crons ne fonctionnent pas

- Vérifier que le `CRON_SECRET` dans la crontab correspond au `.env`
- Le cron relance doit tourner **toutes les 2 minutes** (pas 1x/jour) — c'est lui qui envoie les welcome emails (T+5min) ET les relances (J+3/J+6/J+9)
- Tester manuellement :
  ```bash
  curl -X POST -H "Authorization: Bearer SECRET" https://crm.kredix.fr/api/cron/relance
  curl -X POST -H "Authorization: Bearer SECRET" https://crm.kredix.fr/api/cron/campaign-resume
  ```
- Vérifier que `curl` est installé : `which curl`
- Vérifier les logs : `tail -50 /var/log/kredix-cron.log`
- Vérifier que crontab tourne : `sudo systemctl status cron` (Debian/Ubuntu) ou `sudo systemctl status crond` (CentOS/RHEL)

### Une campagne reste bloquée en "sending"

- Le cron `campaign-resume` (toutes les 5 min) doit la reprendre automatiquement
- Vérifier que le cron tourne (cf. ci-dessus)
- Forcer manuellement : `curl -X POST -H "Authorization: Bearer SECRET" https://crm.kredix.fr/api/cron/campaign-resume`
