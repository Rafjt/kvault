import { defineStore } from "pinia"

export const useCryptoStore = defineStore("crypto", {
  state: () => ({
    /** @type {CryptoKey|null} */
    masterKey: null
  }),

  actions: {
    /**
     * Stocke la Master Key en mémoire (CryptoKey AES-GCM)
     * @param {ArrayBuffer} rawKey
     */
    async setMasterKey(rawKey) {
      this.masterKey = await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM", length: 256 },
        false, // NON extractable
        ["encrypt", "decrypt"]
      )
    },

    /**
     * Supprime toute la crypto (logout / refresh)
     */
    clear() {
      this.masterKey = null
    }
  }
})


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
