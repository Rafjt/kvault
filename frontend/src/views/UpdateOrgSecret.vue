<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"
import { useCryptoStore } from "../stores/crypto.store"
import { API_BASE_URL } from "../components/constant"

import {
  decryptOsk,
  importOSK,
  decryptOrganizationSecret,
  encryptOrganizationSecret
} from "../function/crypto"

const router = useRouter()
const cryptoStore = useCryptoStore()

const props = defineProps({
  orgId: {
    type: String,
    required: true
  },
  secretId: {
    type: String,
    required: true
  }
})

const loading = ref(false)
const errorMessage = ref("")
const osk = ref(null)

const form = ref({
  name: "",
  type: "text",
  value: ""
})

async function submitSecret() {
  errorMessage.value = ""

  if (!osk.value) {
    errorMessage.value = "Organization key not loaded"
    return
  }

  loading.value = true

  try {

    const [ciphertext, encryptedCipherKey] =
      await encryptOrganizationSecret(
        form.value.value,
        osk.value
      )

    const res = await fetch(
      `${API_BASE_URL}/org/${props.orgId}/secret/${props.secretId}`,
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: form.value.name,
          type: form.value.type,
          ciphertext,
          encrypted_cipher_key: encryptedCipherKey
        })
      }
    )

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.message || "Update failed")
    }

    router.push(`/org/${props.orgId}`)

  } catch (err) {

    console.error(err)
    errorMessage.value = err.message || "Update failed"

  } finally {
    loading.value = false
  }
}

onMounted(async () => {

  if (!cryptoStore.masterKey) {
    errorMessage.value = "Crypto context not loaded"
    return
  }

  try {

    const res = await fetch(
      `${API_BASE_URL}/org/${props.orgId}/secret/${props.secretId}`,
      {
        credentials: "include"
      }
    )

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.message || "Failed to load secret")
    }

    const rawOsk = await decryptOsk(
      data.protected_osk,
      cryptoStore.masterKey
    )

    osk.value = await importOSK(rawOsk)

    const secret = data.secret

    form.value.name = secret.name
    form.value.type = secret.type

    form.value.value =
      await decryptOrganizationSecret(
        secret.ciphertext,
        secret.encrypted_cipher_key,
        osk.value
      )

  } catch (err) {

    console.error(err)
    errorMessage.value = err.message || "Failed to load secret"

  }

})
</script>

<template>
  <div style="max-width:480px;margin:auto">

    <button @click="router.push(`/org/${props.orgId}`)">
      ← Cancel
    </button>

    <h2>Update organization secret</h2>

    <div
      v-if="errorMessage"
      class="error-message"
    >
      {{ errorMessage }}
    </div>

    <form @submit.prevent="submitSecret">

      <div>
        <label>Name</label>

        <input
          v-model="form.name"
          type="text"
          required
        />
      </div>

      <div>
        <label>Type</label>

        <select v-model="form.type">
          <option value="text">Text</option>
          <option value="password">Password</option>
          <option value="token">Token</option>
          <option value="identifier">Identifier</option>
          <option value="note">Note</option>
        </select>
      </div>

      <div>
        <label>Value</label>

        <textarea
          v-model="form.value"
          rows="3"
          required
        />
      </div>

      <button :disabled="loading">
        {{ loading ? "Updating..." : "Update secret" }}
      </button>

    </form>

  </div>
</template>