#!/bin/zsh

# Quitter immédiatement si une commande échoue
set -euo pipefail # Le -u lève une erreur si une variable est vide, le -o pipefail sécurise les pipes

# On affiche le premier argument (s'il existe, grâce à alternative par défaut)
echo "${1:-Aucun argument fourni}"

if [ "${1:-}" = "-c" ]
then
   kind create cluster --config ../kind-config.yaml
fi

# 1. Chargement des images en arrière-plan pendant l'installation de l'Ingress
echo "📦 Chargement des images Docker..."
kind load docker-image kvault-backend:latest &
kind load docker-image kvault-frontend:latest &

echo "🌐 Installation de l'Ingress NGINX..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo "📂 Création du namespace et des secrets..."
kubectl create ns kvault --dry-run=client -o yaml | kubectl apply -f -

# Création du secret TLS (déplacé ici car l'Ingress en a besoin dès le départ)
if [[ -f kvault.crt && -f kvault.key ]]; then
  kubectl create secret tls kvault-tls \
    --cert=kvault.crt \
    --key=kvault.key \
    -n kvault --dry-run=client -o yaml | kubectl apply -f -
else
  echo "⚠️ Attention: kvault.crt ou kvault.key manquant. Le secret TLS n'a pas été créé."
fi

# Attendre la fin du chargement des images
wait
echo "✅ Images chargées avec succès."

echo "⏳ Attente du contrôleur Ingress NGINX..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

echo "💾 Déploiement de la base de données..."
###### ajout de la partie secret
kubectl apply -f secret-db.yaml
######
kubectl apply -f db.yaml -n kvault
kubectl apply -f db-backup-pvc.yaml
kubectl apply -f db-backup-cronjob.yaml


# Attente que le Pod DB soit prêt
kubectl wait --for=condition=ready pod -l app=kvault-db -n kvault --timeout=120s

# 3. Optimisation de l'initialisation de la DB
echo "🏗️ Initialisation de la base de données..."
kubectl apply -f db-init-configmap.yaml -n kvault
# Suppression d'un éventuel ancien Job pour éviter les erreurs au second lancement
kubectl delete job kvault-db-init-job -n kvault --ignore-not-found

kubectl apply -f db-init-job.yaml -n kvault
kubectl wait --for=condition=complete job/kvault-db-init-job -n kvault --timeout=120s

echo "🚀 Déploiement du Frontend, Backend et Ingress..."
kubectl apply -f backend.yaml -n kvault
kubectl apply -f frontend.yaml -n kvault
kubectl apply -f ingress.yaml -n kvault
# AJOUTER LA PARTIE BACKUP DE DB

echo "🎉 Déploiement terminé avec succès !"
