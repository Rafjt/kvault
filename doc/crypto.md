# Vue d’ensemble du modèle crypto KVault

Ton modèle repose sur une idée clé :

> **Le backend ne doit jamais connaître la master key en clair.**

Le mot de passe utilisateur sert **uniquement à dériver une KEK** (Key Encryption Key) qui sert à protéger la vraie clé de chiffrement.

Architecture logique :

```text
Password utilisateur
        ↓ PBKDF2
       KEK
        ↓ AES-GCM
Master Key (32 bytes random)
        ↓ AES-GCM
Secrets utilisateur
```

Donc :

* **Password ≠ clé de chiffrement**
* **Master key = vraie clé des secrets**
* **KEK = clé dérivée servant seulement à protéger la master key**

---

# REGISTER — workflow crypto complet

## 1. Le frontend

L’utilisateur saisit :

```text
email
password
confirm password
```

Le frontend :

* valide la policy password
* envoie en HTTPS :

```json
{
  "email": "user@mail.com",
  "password": "SuperStrongPassword123!"
}
```

### Important

À ce stade :

**le frontend ne chiffre rien** (dans votre implémentation actuelle)

Le password est protégé **par TLS (HTTPS)**.

---

## 2. Le backend reçoit le mot de passe

Le backend fait plusieurs choses **séparées**.

---

## Étape A — Hash password d’authentification

Tu fais :

```js
hashedPassword = bcrypt(password)
```

Objectif :

> authentifier plus tard l’utilisateur.

Stocké en DB :

```text
hashed_master_password
```

Le backend **ne stocke jamais le password brut**.

---

## Étape B — Génération du salt KDF

Backend :

```js
kdfSalt = crypto.randomBytes(16)
```

Objectif :

éviter rainbow tables sur la dérivation PBKDF2.

Stocké :

```text
kdf_salt
```

---

## Étape C — Génération de la vraie clé du coffre

Backend :

```js
masterKey = crypto.randomBytes(32)
```

C’est :

```text
256 bits aléatoires
```

C’est **LA clé du coffre**.

Elle servira à chiffrer :

* passwords
* API keys
* secrets
* tokens
* credentials

Cette clé :

> ne dépend PAS du password.

Très bon design crypto.

---

## Étape D — Dérivation de la KEK

Le backend dérive :

```js
kek = pbkdf2(
  password,
  kdfSalt,
  210000,
  32,
  sha256
)
```

Tu utilises :

PBKDF2

Objectif :

transformer le password humain faible en clé robuste.

Résultat :

```text
32 bytes
```

---

## Étape E — Chiffrement de la master key

Tu fais :

```js
AES-256-GCM
```

avec :

```text
key = kek
plaintext = masterKey
```

Tu génères :

```js
iv = random(12)
```

Puis :

```text
ciphertext
authTag
```

Format stocké :

```text
IV || ciphertext || tag
```

dans :

```text
encrypted_master_key
```

Très propre.

---

## Ce qui finit en DB

Utilisateur :

```text
login
hashed_master_password
kdf_salt
encrypted_master_key
verification_token
token_expiry
```

Mais **PAS** :

❌ password brut
❌ master key en clair
❌ secrets en clair

---

# LOGIN — workflow crypto

Maintenant le plus intéressant.

---

## 1. Frontend → backend

Le frontend envoie :

```json
{
  "email": "...",
  "password": "..."
}
```

---

## 2. Vérification du password

Backend :

```js
bcrypt.compare(password, hashedPassword)
```

Si faux :

```text
401 Unauthorized
```

Fin.

---

## 3. Re-dérivation de la KEK

Si mot de passe valide :

Backend recharge :

```text
kdf_salt
encrypted_master_key
```

Puis :

```js
kek = pbkdf2(password, salt)
```

Même paramètres :

```text
210k iterations
sha256
32 bytes
```

Même input = même clé.

---

## 4. Déchiffrement de la master key

Backend :

```text
encrypted_master_key
```

est séparé en :

```text
IV
ciphertext
authTag
```

Puis :

```js
AES-256-GCM decrypt
```

avec :

```text
key = kek
```

Résultat :

```text
masterKey
```

Tu récupères enfin :

> la vraie clé du coffre

---

## 5. Session login

Là vous aviez choisi :

token auth en DB :

table :

```text
auth_tokens
```

Tu génères un token :

```js
crypto.randomBytes(32)
```

Puis :

```js
SHA-256(token)
```

stocké DB :

```text
token_hash
```

Le token brut :

→ envoyé cookie HTTP only.

Donc :

### DB compromise

attaquant ne voit que :

```text
token_hash
```

et pas les vrais tokens.

Très bien aussi.

---

# Qui connaît quoi ?

## Frontend

Connaît :

✅ password utilisateur

Ne connaît pas :

❌ master key
❌ KEK

---

## Backend

Connaît temporairement :

✅ password (request HTTPS)
✅ KEK dérivée
✅ master key déchiffrée

Mais :

> seulement en RAM pendant la requête

Ne stocke jamais en clair.

---

## Database

Connaît :

✅ hash password
✅ encrypted master key
✅ salts
✅ ciphertexts

Ne connaît jamais :

❌ password
❌ master key
❌ secrets en clair

---

# Quand un secret sera créé

Plus tard avec ton app consommatrice :

workflow prévu :

```text
App
   ↓ auth
KVault backend
   ↓ récupère master key
AES-GCM(secret, masterKey)
   ↓
DB
```

Au read :

```text
ciphertext
    ↓ AES-GCM decrypt(masterKey)
plaintext
```

---

# Niveau sécurité réel

Tu es proche d’un mini :

HashiCorp Vault / password manager académique.

Bon points de ton design :

✅ séparation auth / crypto
✅ PBKDF2 fort (210k)
✅ AES-256-GCM
✅ master key indépendante
✅ password jamais stocké
✅ token hashé DB
✅ TLS ingress k8s
✅ cookies httpOnly

Faiblesses actuelles :

⚠️ le backend voit encore le password brut (normal dans une archi web classique)

Le “next level” serait :

```text
client-side encryption
```

où le frontend chiffre avant envoi.

Mais pour un PAC / projet d’école :

> ton modèle actuel est déjà très solide et défendable techniquement.
