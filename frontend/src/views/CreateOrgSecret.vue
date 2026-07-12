<script setup>
import { ref, onMounted } from "vue"
import { useCryptoStore } from "../stores/crypto.store"
import { useRouter } from "vue-router"
import { encryptOrganizationSecret, decryptOsk, importOSK } from "../function/crypto"
import { fetchOrg, createOrganizationSecret } from "../function/function"

const cryptoStore = useCryptoStore()
const router = useRouter()

const props = defineProps({
  orgId: {
    type: String,
    required: true
  }
})

const loading = ref(false)
const errorMessage = ref("")

const form = ref({
  name: "",
  type: "text",
  value: ""
})

onMounted(async () => {
  try {
    loading.value = true
    const data = await fetchOrg(props.orgId)
    
    console.log(data)

    const decryptedOsk = await decryptOsk(
        data.organization.protected_osk,
        cryptoStore.rsaPrivateKey
    )

    console.log("decrypted", decryptedOsk)

    const oskKey = await importOSK(decryptedOsk)

    console.log(oskKey)

    cryptoStore.setOrganizationKey(props.orgId, oskKey)

  } catch (err) {
    console.error("Error during organization loading:", err)
    errorMessage.value = "Enable to load organization key"
  } finally {
    loading.value = false
  }
})

async function submitSecret() {
  errorMessage.value = ""

  const osk = cryptoStore.getOrganizationKey(props.orgId)

  if (!osk) {
    errorMessage.value = "Organization key not loaded yet. Please wait."
    return
  }

  if (!form.value.name || !form.value.value) {
    errorMessage.value = "Name and value are required"
    return
  }

  loading.value = true

  try {

    const [ciphertext, encryptedCipherKey] = await encryptOrganizationSecret(form.value.value, osk)

    await createOrganizationSecret(
      props.orgId,
      form.value.name,
      form.value.type,
      ciphertext,
      encryptedCipherKey
    )

    form.value.value = ""
    router.push("/home")

  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "Unexpected error"
  } finally {
    loading.value = false
  }
}

async function back_home() {
  router.push("/home")
}
</script>

<template>
  <div style="max-width: 480px; margin: auto">
    <button @click="back_home()">
        ← Cancel
    </button>
    <h2>Create an organization secret</h2>

    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>

    <form @submit.prevent="submitSecret">
      <div>
        <label>Name</label>
        <input
          v-model="form.name"
          type="text"
          placeholder="ex: API key prod"
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
