#!/bin/zsh

kind create cluster --config ../kind-config.yaml

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

kubectl create ns kvault 

kind load docker-image kvault-backend:latest
kind load docker-image kvault-frontend:latest

sleep 120

kubectl apply -f db.yaml

sleep 30

kubectl apply -f .
