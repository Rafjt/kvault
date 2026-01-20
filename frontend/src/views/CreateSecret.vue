<script setup>
import { ref } from "vue"
import { useCryptoStore, encryptSecret } from "../stores/crypto.store"
import { API_BASE_URL } from "../components/constant"
import { useRouter } from "vue-router"

const cryptoStore = useCryptoStore()
const router = useRouter()

const loading = ref(false)
const errorMessage = ref("")

const form = ref({
  name: "",
  type: "text",
  value: ""
})
async function back_home() {
  router.push("/home")
}
async function submitSecret() {
  errorMessage.value = ""

  if (!cryptoStore.masterKey) {
    errorMessage.value = "Crypto context not loaded"
    return
  }

  if (!form.value.name || !form.value.value) {
    errorMessage.value = "Name and value are required"
    return
  }

  loading.value = true

  try {
    // 🔐 chiffrement uniquement de la valeur
    const { ciphertext, nonce } = await encryptSecret(
      form.value.value,
      cryptoStore.masterKey
    )

    const res = await fetch(`${API_BASE_URL}/create`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.value.name,
        type: form.value.type,
        ciphertext,
        nonce
      })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || "Failed to create secret")
    }

    // reset + retour home
    form.value.value = ""
    router.push("/home")

  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "Unexpected error"
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div style="max-width: 480px; margin: auto">
    <button @click="back_home()">
        Cancel
    </button>
    <h2>Create a secret</h2>

    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>

    <form @submit.prevent="submitSecret">
      <!-- NAME -->
      <div>
        <label>Name</label>
        <input
          v-model="form.name"
          type="text"
          placeholder="ex: API key prod"
          required
        />
      </div>

      <!-- TYPE -->
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

      <!-- VALUE -->
      <div>
        <label>Value</label>
        <textarea
          v-model="form.value"
          placeholder="Sensitive value"
          rows="3"
          required
        />
      </div>

      <button :disabled="loading">
        {{ loading ? "Encrypting..." : "Create secret" }}
      </button>
    </form>
  </div>
</template>
