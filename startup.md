# KVault — Démarrage du projet

Déploiement local sur un cluster Kubernetes `kind`, avec Ingress NGINX en HTTPS sur `https://kvault.local`.

## Sommaire

0. Installation des prérequis
1. Cloner le repo
2. Builder les images
3. Préparer les fichiers locaux (non versionnés)
4. Lancer le cluster
5. Vérifier

> Pas besoin de Node.js / npm sur la machine : `npm ci` et le build Vite sont exécutés **dans** les Dockerfiles.

---

## 0. Installation des prérequis

Outils nécessaires : **Git**, **Docker**, **kind**, **kubectl**, **openssl**. Les ports **80** et **443** doivent être libres (mappés par `kind-config.yaml`).

### Linux (Debian / Ubuntu)

```bash
# Git + openssl + curl
sudo apt update
sudo apt install -y git openssl curl ca-certificates

# Docker (script officiel)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker            # ou se déconnecter / reconnecter

# kubectl (amd64 ; pour ARM64 remplacer "amd64" par "arm64")
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm kubectl

# kind (amd64 ; pour ARM64 remplacer "amd64" par "arm64")
# Vérifier la dernière version sur https://github.com/kubernetes-sigs/kind/releases
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.27.0/kind-linux-amd64
sudo install -o root -g root -m 0755 kind /usr/local/bin/kind
rm kind
```

### macOS (Homebrew)

```bash
brew install git openssl kubectl kind
brew install --cask docker     # puis lancer Docker Desktop une fois
```

### Windows

Utiliser **WSL2** (Ubuntu), puis suivre la section Linux dans le terminal WSL. Installer **Docker Desktop** avec l'intégration WSL activée (Settings → Resources → WSL integration). Lancer ensuite tout le reste du guide depuis le terminal WSL.

> Pour l'entrée `kvault.local`, éditer aussi le fichier hosts **Windows** (`C:\Windows\System32\drivers\etc\hosts`) si tu ouvres le site depuis un navigateur Windows.

### Vérifier l'installation

```bash
git --version
docker --version && docker info > /dev/null && echo "Docker OK"
kubectl version --client
kind version
openssl version
```

---

## 1. Cloner le repo

```bash
git clone https://github.com/Rafjt/kvault.git
cd kvault
```

## 2. Builder les images

Les manifests utilisent `imagePullPolicy: Never` : les images doivent exister en local avec exactement ces noms/tags (`kvault-backend:latest`, `kvault-frontend:latest`).

**Backend**

```bash
docker build -t kvault-backend:latest ./backend
```

**Frontend** — les URLs de l'API sont injectées au build par Vite (`ARG` → `ENV`), il faut donc les passer ici. Elles pointent vers l'Ingress (`/auth` et `/api` sont routés vers le backend) :

```bash
docker build -t kvault-frontend:latest \
  --build-arg VITE_API_AUTH_URL=https://kvault.local/auth \
  --build-arg VITE_API_BASE_URL=https://kvault.local/api \
  ./frontend
```

## 3. Préparer les fichiers locaux (non versionnés)

Le `.gitignore` de `k8s/` exclut `secret*`, `*.crt`, `*.key`, etc. Ces fichiers **ne sont pas dans le repo** et doivent exister dans `k8s/` avant de lancer le script (celui-ci s'arrête à la première erreur) :

| Fichier | Utilisé pour |
|---|---|
| `k8s/secret-db.yaml` | Secret de la base MySQL |
| `k8s/secret-minio.yaml` | Secret MinIO (backups DB) |
| `k8s/kvault.crt` + `k8s/kvault.key` | Secret TLS `kvault-tls` pour l'Ingress |

Génération d'un certificat auto-signé :

```bash
cd k8s
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout kvault.key -out kvault.crt \
  -subj "/CN=kvault.local" \
  -addext "subjectAltName=DNS:kvault.local"
```

Résolution du nom de domaine en local :

```bash
echo "127.0.0.1 kvault.local" | sudo tee -a /etc/hosts
```

## 4. Lancer le cluster

Depuis le dossier `k8s/` (en minuscules, sensible à la casse sous Linux) :

```bash
cd k8s        # si tu n'y es pas déjà
chmod +x cluster_setup.sh
./cluster_setup.sh -c
```

L'option `-c` crée le cluster `kind` (`../kind-config.yaml`). Sans `-c`, le script réutilise un cluster existant.

Le script enchaîne : chargement des images dans kind, installation de l'Ingress NGINX, namespace `kvault`, secret TLS, base de données, système de backup (MinIO + CronJob), job d'init de la DB, puis backend, frontend et Ingress.

## 5. Vérifier

```bash
kubectl get pods -n kvault
kubectl get ingress -n kvault
```

Puis ouvrir **https://kvault.local** (accepter l'avertissement du certificat auto-signé).

---

## Dépannage rapide

- **`permission denied` sur le socket Docker** → ton utilisateur n'est pas dans le groupe `docker` (voir étape 0), ou Docker n'est pas lancé.
- **`bind: address already in use` à la création du cluster** → les ports 80/443 sont déjà utilisés (nginx, apache, autre conteneur) : les libérer.
- **`secret-db.yaml: no such file`** → fichier local manquant (étape 3).
- **`ErrImageNeverPull`** → l'image n'est pas dans kind : rebuilder puis `kind load docker-image kvault-backend:latest` (idem frontend).
- **Modification du code** → rebuilder l'image, la recharger dans kind, puis `kubectl rollout restart deployment/kvault-backend -n kvault` (ou `kvault-frontend`).
- **Repartir de zéro** → `kind delete cluster` puis relancer `./cluster_setup.sh -c`.
