import { argon2id } from 'hash-wasm'

// encryptBinary(...)
// decryptBinary(...)

// encryptOSK(...)
// decryptOSK()

// generateAESKey()

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

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...iv))
  }
}

export async function decryptSecret(ciphertextB64, nonceB64, masterKey) {
  if (!masterKey) {
    throw new Error("MasterKey not loaded");
  }

  const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(nonceB64), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128
    },
    masterKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}