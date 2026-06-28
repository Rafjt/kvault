import { defineStore } from "pinia"

export const useCryptoStore = defineStore("crypto", {
  state: () => ({
    /** @type {CryptoKey|null} */
    masterKey: null,
    rsaPublicKey: null,
    rsaPrivateKey: null
  }),

  actions: {

    async setMasterKey(rawKey) {

      this.masterKey = await crypto.subtle.importKey(
        "raw",
        rawKey,
        {
          name: "AES-GCM",
          length: 256
        },
        false,
        ["encrypt","decrypt"]
      )

    },

    async setRSAKeys(publicKey, privateKey) {

      this.rsaPublicKey = publicKey
      this.rsaPrivateKey = privateKey

    },

    clear() {

      this.masterKey = null
      this.rsaPublicKey = null
      this.rsaPrivateKey = null

    }

  }
})
