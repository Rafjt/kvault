#!/bin/zsh

kind create cluster --config ../kind-config.yaml

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

kubectl create ns kvault 

kind load docker-image kvault-backend:latest
kind load docker-image kvault-frontend:latest

sleep 120

kubectl apply -f db.yaml

# attendre que mysql soit ready
kubectl wait --for=condition=ready pod -l app=kvault-db -n kvault --timeout=120s

kubectl apply -f db-init-configmap.yaml
kubectl apply -f db-init-job.yaml

kubectl wait --for=condition=complete job/kvault-db-init-job -n kvault --timeout=120s

kubectl apply -f backend.yaml
kubectl apply -f frontend.yaml
kubectl apply -f ingress.yaml

kubectl create secret tls kvault-tls \
  --cert=kvault.crt \
  --key=kvault.key \
  -n kvault
