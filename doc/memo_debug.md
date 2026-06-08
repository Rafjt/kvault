Voici ta fiche mémo sur mesure, qui retrace tout ton parcours de débogage depuis la création de la VM jusqu'au déploiement réussi de ton cluster Kubernetes.

C'est la feuille de route parfaite à garder sous le coude si tu dois réinstaller ton environnement ou si tu rencontres à nouveau ces erreurs.

---

# 📝 FICHE MÉMO : Déploiement & Débogage K8s (Kind) sur VM

## 1. Accès distant (Clé SSH & GitHub)

Pour cloner et pull tes dépôts GitHub de manière sécurisée depuis la VM.

* **Générer la clé :** `ssh-keygen -t ed25519 -C "ton_email@example.com"`
* **Activer l'agent :** `eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519`
* **Récupérer la clé publique :** `cat ~/.ssh/id_ed25519.pub` (à coller dans GitHub -> Settings -> SSH Keys).
* **Tester :** `ssh -T git@github.com`

---

## 2. Docker & Problèmes de Permissions

L'erreur `permission denied` apparaît lorsque l'utilisateur actuel n'a pas les droits sur le socket Docker.

* **Ajouter l'utilisateur au groupe Docker :** `sudo usermod -aG docker $USER`
* **Appliquer sans redémarrer :** `newgrp docker`
* **Syntaxe Build moderne (BuildKit/Buildx) :** `docker build -t nom-image:tag ./dossier`

---

## 3. Conflits de Ports (Erreur Kind `address already in use: 443`)

Kind essaie de lier le port **443** de ta VM pour l'Ingress NGINX. Si un autre processus l'utilise, le cluster refuse de se créer (Erreur 125).

### 🔍 Étape 1 : Identifier le coupable

```bash
sudo lsof -i :443
# OU
sudo ss -tulpn | grep :443

```

### 🛠️ Étape 2 : Résolution (Deux stratégies)

* **Stratégie A : Libérer le port** (Cas de `wazuh-dashboard` ou d'un serveur `node` fantôme) :
```bash
# Arrêter le service squatteur (ex: Wazuh)
sudo systemctl stop wazuh-dashboard

# Forcer la fermeture si c'est un processus rebelle
sudo fuser -k 443/tcp

```


* **Stratégie B : Dériver le port dans `kind-config.yaml**` (Si le service sur la VM doit rester actif) :
```yaml
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 443
        hostPort: 8443 # <-- Redirige le HTTPS de Kind sur le 8443 de la VM

```



### 🧹 Étape 3 : Nettoyer le cluster planté avant de relancer

```bash
kind delete cluster
./cluster_setup.sh -c

```

---

## 4. Routage Local (Accès à l'application via URL)

Une fois le cluster démarré avec succès, l'application est déployée mais inaccessible via `http://kvault.local` tant que la VM ne sait pas où pointe ce nom de domaine.

* **Action :** Associer le domaine à l'IP locale de la VM dans le fichier `/etc/hosts`.
* **Commande :** `sudo nano /etc/hosts`
* **Ligne à ajouter tout à la fin :**
```text
127.0.0.1  kvault.local

```



---

## ⚠️ Check-list pour les prochains lancements :

1. **Les fichiers TLS :** Assure-toi d'avoir `kvault.crt` et `kvault.key` dans ton dossier si ton Ingress a besoin du chiffrement HTTPS, sinon attention aux erreurs de certificat (page blanche).
2. **Ordre du script :** Toujours vérifier que l'étape `kind load docker-image` se termine bien avant que les pods applicatifs ne démarrent (pour éviter le bug `ImagePullBackOff`).
