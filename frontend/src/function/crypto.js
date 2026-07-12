import { argon2id } from 'hash-wasm'


export const arrayBufferToBase64 = (buffer) => {
  return btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
}

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

export async function splitExtendedKey(extendedKeyRaw) {
    // 32 premier octets : KEK locale pour chiffrer/déchiffrer le coffre
    const kekRaw = extendedKeyRaw.slice(0, 32);
    
    // 32 dernier octets : pour l'authentification
    const authRaw = extendedKeyRaw.slice(32, 64);
    
    // On passe le bloc auth dans SHA-256 pour découpler mathématiquement le hash du réseau de la KEK
    const authHashBuffer = await crypto.subtle.digest("SHA-256", authRaw);
    const authMasterHash = arrayBufferToBase64(authHashBuffer);

    return { kekRaw, authMasterHash };
}

export async function deriveExtendedKey(password, salt) {
    const kekRaw = await argon2id({
      password: password,
      salt: salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536,
      hashLength: 64,
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

  if (encryptedData && encryptedData.type === 'Buffer' && Array.isArray(encryptedData.data)) {
    combined = new Uint8Array(encryptedData.data);
  } else if (typeof encryptedData === 'string') {
    combined = Uint8Array.from(
      atob(encryptedData),
      c => c.charCodeAt(0)
    );
  } else if (encryptedData instanceof Uint8Array) {
    combined = encryptedData;
  } else {
    throw new Error("Format de données chiffrées invalide ou inconnu");
  }

  // Extraction de l'IV ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

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

  if (encryptedOsk && encryptedOsk.type === 'Buffer' && Array.isArray(encryptedOsk.data)) {
    encryptedBuffer = new Uint8Array(encryptedOsk.data).buffer;
  } 
  else if (encryptedOsk instanceof Uint8Array || Array.isArray(encryptedOsk)) {
    encryptedBuffer = new Uint8Array(encryptedOsk).buffer;
  }
  else if (typeof encryptedOsk === 'string') {
    encryptedBuffer = Uint8Array.from(atob(encryptedOsk), c => c.charCodeAt(0)).buffer;
  } 
  else {
    throw new Error("Format de clé protégé (protected_osk) invalide ou inconnu.");
  }

  const oskBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKeyObject, 
    encryptedBuffer
  );

  return new Uint8Array(oskBuffer);
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

    const encryptedCipherKey = await encryptAESKey(
        rawCipherKey,
        osk
    )

    return [ciphertext, encryptedCipherKey]

}

export async function decryptOrganizationSecret(ciphertext, encryptedCipherKey, osk) {

    const rawCipherKey = await decryptAESKey(
        encryptedCipherKey,
        osk
    )

    const cipherKey = await crypto.subtle.importKey(
        "raw",
        rawCipherKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    )

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