import { argon2id } from 'hash-wasm'

// ======
//  AES
// ======

export async function generateAESKey() {
  const cipherKey = await crypto.subtle.generateKey(
  {
    name: "AES-GCM",
    length: 256
  },
  true,
  ["encrypt","decrypt"]
  )
  return cipherKey
}

export async function encryptAESKey(rawKey, wrappingKey) {

    if (!wrappingKey) {
        throw new Error("Wrapping key not loaded")
    }

    const iv = crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv
        },
        wrappingKey,
        rawKey
    )

    const combined = new Uint8Array(
        iv.length + encrypted.byteLength
    )

    combined.set(iv, 0)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(
        String.fromCharCode(...combined)
    )

}

export async function decryptAESKey(encryptedKeyB64, wrappingKey) {

    if (!wrappingKey) {
        throw new Error("Wrapping key not loaded")
    }

    const combined = Uint8Array.from(
        atob(encryptedKeyB64),
        c => c.charCodeAt(0)
    )

    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    const rawCipherKey = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv
        },
        wrappingKey,
        ciphertext
    )

  return rawCipherKey

}

// ======
//  KEK
// ======

export async function deriveKEK(password, salt) {
    const kekRaw = await argon2id({
      password: password,
      salt: salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: 'binary'
    })
    return kekRaw

} 

export async function importKEK(kekRaw, action) {
    const kek = await crypto.subtle.importKey(
      "raw", kekRaw, { name: "AES-GCM" }, false, [action]
    )
    return kek
}

// ============
//  MASTER KEY
// ============

export async function encryptMasterKey(iv, kek, masterKey) {
    const encryptedMK = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, kek, masterKey
    )
    return encryptedMK
}

export async function decryptMasterKey(iv, kek, encryptedMK) {
    
    const decryptedMKBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      kek,
      encryptedMK
    )
    return decryptedMKBuffer
}

// ==============
//  RSA KEY-PAIR
// ==============

export async function generateRSAKeyPair() {
    const rsaKeyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt"]
    )
    return rsaKeyPair
}

export async function importRsaKeyPair(PublicKey, PrivateKey) {
  const [publicKeySpki, privateKeyPkcs8] = await Promise.all([
    crypto.subtle.importKey("spki", PublicKey, {name: "RSA-OAEP", hash: "SHA-256"}, false, ["encrypt"]),
    crypto.subtle.importKey("pkcs8", PrivateKey, {name: "RSA-OAEP", hash: "SHA-256"}, false, ["decrypt"])
  ])
  return { publicKeySpki, privateKeyPkcs8 }
}

export async function exportRsaKeyPair(rsaKeyPair) {
  const [publicKeySpki, privateKeyPkcs8] = await Promise.all([
    crypto.subtle.exportKey("spki", rsaKeyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", rsaKeyPair.privateKey)
  ])

  return { publicKeySpki, privateKeyPkcs8 }
}

export async function decryptPrivateKey(iv, kek, encryptedPrivateKey) {
    const decryptedPrivateKeyBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      kek,
      encryptedPrivateKey
    )
    return decryptedPrivateKeyBuffer
}

export async function encryptPrivateKey(iv, kek, privateKey) {
    const encryptedPrivateKey = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      kek,
      privateKey
    )
    return encryptedPrivateKey
}

// ==========
//  SECRETS
// ==========

export async function encryptSecret(value, masterKey) {
  if (!masterKey) {
    throw new Error("MasterKey not loaded")
  }

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    encoded
  )

  const combined = new Uint8Array(
    iv.length + encrypted.byteLength
  )
  combined.set(iv, 0)

  combined.set(
    new Uint8Array(encrypted),
    iv.length
  )

  return btoa(
    String.fromCharCode(...combined)
  )
}

export async function decryptSecret(encryptedData, masterKey) {
  if (!masterKey) {
    throw new Error("MasterKey not loaded");
  }

  let combined;

  //On détecte le format de l'entrée pour le convertir en Uint8Array
  if (encryptedData && encryptedData.type === 'Buffer' && Array.isArray(encryptedData.data)) {
    // Si c'est le Buffer brut envoyé par Sequelize/MySQL
    combined = new Uint8Array(encryptedData.data);
  } else if (typeof encryptedData === 'string') {
    // Si c'est une chaîne Base64 standard
    combined = Uint8Array.from(
      atob(encryptedData),
      c => c.charCodeAt(0)
    );
  } else if (encryptedData instanceof Uint8Array) {
    // Si c'est déjà un Uint8Array
    combined = encryptedData;
  } else {
    throw new Error("Format de données chiffrées invalide ou inconnu");
  }

  // Extraction de l'IV et du ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // 3. Déchiffrement avec WebCrypto API
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    masterKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}
// ==============================
//  ORGANIZATIONS AND ORG_SECRETS
// ==============================

export async function encryptOsk(oskRaw, rsaPublicKeyObject) {
  if (!rsaPublicKeyObject) {
    throw new Error("RSA Public Key object not found. Is user logged in?");
  }

  // Chiffrement direct avec l'objet CryptoKey issu du store
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKeyObject, 
    oskRaw             
  );

  return btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
}

export async function decryptOsk(encryptedOsk, rsaPrivateKeyObject) {
  if (!rsaPrivateKeyObject) {
    throw new Error("RSA Private Key missing");
  }

  let encryptedBuffer;

  // 1. Si Sequelize renvoie un objet Buffer { type: 'Buffer', data: [...] }
  if (encryptedOsk && encryptedOsk.type === 'Buffer' && Array.isArray(encryptedOsk.data)) {
    encryptedBuffer = new Uint8Array(encryptedOsk.data).buffer;
  } 
  // 2. Si c'est directement un tableau ou un Uint8Array
  else if (encryptedOsk instanceof Uint8Array || Array.isArray(encryptedOsk)) {
    encryptedBuffer = new Uint8Array(encryptedOsk).buffer;
  }
  // 3. Si c'est une chaîne Base64 (cas classique de secours)
  else if (typeof encryptedOsk === 'string') {
    encryptedBuffer = Uint8Array.from(atob(encryptedOsk), c => c.charCodeAt(0)).buffer;
  } 
  else {
    throw new Error("Format de clé protégé (protected_osk) invalide ou inconnu.");
  }

  // Déchiffrement RSA-OAEP natif
  const oskBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKeyObject, 
    encryptedBuffer
  );

  return new Uint8Array(oskBuffer); // Renvoie l'OSK brute
}

export async function encryptOrganizationSecret(plaintext,osk) {
    const cipherKey = await generateAESKey()

    const rawCipherKey = await crypto.subtle.exportKey(
        "raw",
        cipherKey
    )

    const ciphertext = await encryptSecret(
        plaintext,
        cipherKey
    )

    console.log(ciphertext)

    const encryptedCipherKey = await encryptAESKey(
        rawCipherKey,
        osk
    )

    return [ciphertext, encryptedCipherKey]

}

export async function decryptOrganizationSecret(ciphertext, encryptedCipherKey, osk) {
    // Déchiffrer la clé du secret à l'aide de l'OSK (Clé de l'Organisation)
    const rawCipherKey = await decryptAESKey(
        encryptedCipherKey,
        osk
    )

    // Importer la clé brute récupérée pour que Web Crypto puisse l'utiliser
    const cipherKey = await crypto.subtle.importKey(
        "raw",
        rawCipherKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    )

    // Déchiffrer le secret avec la clé désormais en clair
    const plaintext = await decryptSecret(
        ciphertext,
        cipherKey
    )

    return plaintext
}

export async function importOSK(oskRaw) {
  return await crypto.subtle.importKey(
    "raw",
    oskRaw,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}