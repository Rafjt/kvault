<script setup>
import { ref, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useCryptoStore } from "../stores/crypto.store"
import {
  fetchSecret,
  updateSecret
} from "../function/function"
import { encryptSecret, decryptSecret } from "../function/crypto"

const route = useRoute()
const router = useRouter()
const cryptoStore = useCryptoStore()

const secretId = route.params.id

const loading = ref(false)
const errorMessage = ref("")

const form = ref({
  name: "",
  type: "text",
  value: ""
})

async function submitSecret() {
  errorMessage.value = ""

  if (!cryptoStore.masterKey) {
    errorMessage.value = "Crypto context not loaded"
    return
  }

  loading.value = true

  try {
    const ciphertext = await encryptSecret(
      form.value.value,
      cryptoStore.masterKey
    )

    await updateSecret(secretId, {
      name: form.value.name,
      type: form.value.type,
      ciphertext
    })

    router.push("/home")

  } catch (err) {
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
    const secret = await fetchSecret(secretId)

    form.value.name = secret.name
    form.value.type = secret.type

    form.value.value = await decryptSecret(
      secret.ciphertext,
      cryptoStore.masterKey
    )

  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "Failed to load secret"
  }
})

</script>
<template>
  <div style="max-width: 480px; margin: auto">
    <button @click="router.push('/home')">Cancel</button>

    <h2>Update secret</h2>

    <div v-if="errorMessage" class="error-message">
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
        {{ loading ? "Encrypting..." : "Update secret" }}
      </button>
    </form>
  </div>
</template>
