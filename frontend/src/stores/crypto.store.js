import { defineStore } from "pinia"

export const useCryptoStore = defineStore("crypto", {
  state: () => ({
    /** @type {CryptoKey|null} */
    masterKey: null,
    rsaPublicKey: null,
    rsaPrivateKey: null,
    organizationKeys: {}
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

    setOrganizationKey(orgId, key) {

        this.organizationKeys[String(orgId)] = key

    },

    getOrganizationKey(orgId) {

        return this.organizationKeys[String(orgId)] ?? null

    },

    removeOrganizationKey(orgId) {

        delete this.organizationKeys[String(orgId)]

    },


    clear() {

      this.masterKey = null
      this.rsaPublicKey = null
      this.rsaPrivateKey = null
      this.organizationKeys = {}

    }

  }
})
