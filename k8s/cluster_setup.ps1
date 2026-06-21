$ErrorActionPreference = "Stop"

param (
    [string]$Mode = ""
)

Write-Host "Argument reçu: $Mode"

# ----------------------------
# CREATE CLUSTER
# ----------------------------
if ($Mode -eq "-c") {
    Write-Host "🚀 Création du cluster Kind..."

    kind create cluster `
        --config ../kind-config.yaml `
        --image kindest/node:v1.27.3
}

# ----------------------------
# LOAD IMAGES
# ----------------------------
Write-Host "📦 Chargement des images Docker..."

$job1 = Start-Job { kind load docker-image kvault-backend:latest }
$job2 = Start-Job { kind load docker-image kvault-frontend:latest }

# ----------------------------
# INGRESS
# ----------------------------
Write-Host "🌐 Installation Ingress..."

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# ----------------------------
# NAMESPACE
# ----------------------------
Write-Host "📂 Namespace..."

kubectl create ns kvault --dry-run=client -o yaml | kubectl apply -f -

# ----------------------------
# TLS
# ----------------------------
if (Test-Path "kvault.crt" -and Test-Path "kvault.key") {
    Write-Host "🔐 TLS secret..."

    kubectl create secret tls kvault-tls `
        --cert=kvault.crt `
        --key=kvault.key `
        -n kvault `
        --dry-run=client -o yaml | kubectl apply -f -
}
else {
    Write-Warning "TLS files missing"
}

# ----------------------------
# WAIT IMAGES
# ----------------------------
Write-Host "⏳ Waiting images..."

Wait-Job $job1, $job2 | Out-Null
Remove-Job $job1, $job2

Write-Host "✅ Images loaded"

# ----------------------------
# INGRESS READY
# ----------------------------
Write-Host "⏳ Waiting ingress..."

kubectl wait --namespace ingress-nginx `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/component=controller `
    --timeout=120s

# ----------------------------
# DB
# ----------------------------
Write-Host " DB deploy..."

kubectl apply -f db.yaml -n kvault

kubectl wait --for=condition=ready pod -l app=kvault-db -n kvault --timeout=120s

# ----------------------------
# DB INIT
# ----------------------------
Write-Host "🏗️ DB init..."

kubectl apply -f db-init-configmap.yaml -n kvault
kubectl delete job kvault-db-init-job -n kvault --ignore-not-found
kubectl apply -f db-init-job.yaml -n kvault

kubectl wait --for=condition=complete job/kvault-db-init-job -n kvault --timeout=120s

# ----------------------------
# APP
# ----------------------------
Write-Host "🚀 Deploy app..."

kubectl apply -f backend.yaml -n kvault
kubectl apply -f frontend.yaml -n kvault
kubectl apply -f ingress.yaml -n kvault

Write-Host "🎉 DONE"