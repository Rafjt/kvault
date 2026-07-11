<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { createOrganization } from "../function/function"
import { encryptOsk } from "../function/crypto"
import { useCryptoStore } from "../stores/crypto.store"

const cryptoStore = useCryptoStore()

const router = useRouter()

const loading = ref(false)
const errorMessage = ref("")

const form = ref({
  name: ""
})

async function back_home() {
  router.push("/home")
}

async function submitOrganization() {

  errorMessage.value = ""

  if (!form.value.name.trim()) {
    errorMessage.value = "Organization name is required"
    return
  }

  loading.value = true

  try {

    console.log(cryptoStore.rsaPublicKey)

    const osk = crypto.getRandomValues(new Uint8Array(32))

    const encryptedOskBlob = await encryptOsk(osk, cryptoStore.rsaPublicKey)

    await createOrganization(
      form.value.name,
      encryptedOskBlob
    )

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

  <div style="max-width:480px;margin:auto">

    <button @click="back_home">
      ← Cancel
    </button>

    <h2>Create an organization</h2>

    <div
      v-if="errorMessage"
      style="color:#b91c1c"
    >
      {{ errorMessage }}
    </div>

    <form @submit.prevent="submitOrganization">

      <div>

        <label>Organization name</label>

        <input
          v-model="form.name"
          type="text"
          maxlength="255"
          placeholder="ex: DevOps Team"
          required
        />

      </div>

      <button :disabled="loading">

        {{
          loading
            ? "Creating..."
            : "Create organization"
        }}

      </button>

    </form>

  </div>

</template>