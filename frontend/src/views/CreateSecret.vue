<script setup>
import { ref } from "vue"
import { useCryptoStore, encryptSecret } from "../stores/crypto.store"
import { API_BASE_URL} from "../components/constant"

const cryptoStore = useCryptoStore()

const secretValue = ref("")

async function submitSecret() {
  if (!secretValue.value) return

  const { ciphertext, nonce } = await encryptSecret(
    secretValue.value,
    cryptoStore.masterKey
  )

  await fetch(`${API_BASE_URL}/create`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // valeurs en dur ou à adapter
      name: "mon-secret",
      type: "text",
      ciphertext,
      nonce
    })
  })

  secretValue.value = ""
}
</script>

<template>
  <form @submit.prevent="submitSecret">
    <input
      v-model="secretValue"
      type="text"
      placeholder="Tape ton secret ici"
    />
    <button type="submit">Envoyer</button>
  </form>
</template>
