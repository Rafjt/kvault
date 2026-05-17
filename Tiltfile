# -*- mode: Python -*-

# 1. Chargement des manifests Kubernetes
k8s_yaml('k8s/backend.yaml')
k8s_yaml('k8s/frontend.yaml')
k8s_yaml('k8s/ingress.yaml')

# Optionnel : Création automatique du secret TLS s'il n'existe pas
local("kubectl get secret kvault-tls -n kvault || kubectl create secret tls kvault-tls --cert=kvault.crt --key=kvault.key -n kvault")

# 2. Configuration du BACKEND (Node.js)
docker_build(
    'kvault-backend:latest',
    context='./backend',
    dockerfile='./backend/Dockerfile',
    live_update=[
        # Synchronise le code local avec le conteneur
        sync('./backend', '/app'),
        # Si package.json change, on run npm install dans le conteneur
        run('cd /app && npm install', trigger='./backend/package.json'),
        # Si un fichier JS/TS change, on peut trigger un restart du process Node (ex: nodemon)
        # Note : Si tu utilises nodemon dans ton conteneur, le sync suffit à restart l'app.
    ]
)

# 3. Configuration du FRONTEND (Vue.js)
docker_build(
    'kvault-frontend:latest',
    context='./frontend',
    dockerfile='./frontend/Dockerfile',
    live_update=[
        sync('./frontend/src', '/app/src'), # On synchronise uniquement le dossier src
        sync('./frontend/public', '/app/public'),
        run('cd /app && npm install', trigger='./frontend/package.json'),
    ]
)

# 4. Organisation de l'UI Tilt et accès via Ingress

# On lie les logs du backend à l'UI Tilt (plus besoin de port-forward direct)
k8s_resource('kvault-backend')

# On configure la ressource frontend pour qu'elle s'ouvre sur le bon nom de domaine
k8s_resource(
    'kvault-frontend',
    # Indique à Tilt d'ouvrir le navigateur sur ton domaine HTTPS local
    extra_pod_selectors=[{'app.kubernetes.io/component': 'controller'}], # Optionnel: lie aussi les logs de l'ingress si tu veux
)

# On force Tilt à exposer l'Ingress de Nginx (port HTTPS 443 ou HTTP 80)
# Note : L'ingress-nginx de Kind expose généralement le port 80 du conteneur node vers le localhost.