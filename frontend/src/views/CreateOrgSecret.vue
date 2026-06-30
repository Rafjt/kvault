<script setup>
import { ref, onMounted } from "vue"
import { useCryptoStore } from "../stores/crypto.store"
import { API_BASE_URL } from "../components/constant"
import { useRouter } from "vue-router"
import { encryptOrganizationSecret, generateAESKey, decryptOsk, importOSK } from "../function/crypto" // N'oublie pas d'importer decryptOsk
import { fetchOrg } from "../function/function"

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

// 1. On charge l'OSK au montage du composant
onMounted(async () => {
  try {
    loading.value = true
    const data = await fetchOrg(props.orgId)
    console.log("Type de protected_osk :", typeof data.organization.protected_osk)
    console.log("Contenu de protected_osk :", data.organization.protected_osk)
    
    // On déchiffre l'OSK
    const decryptedOsk = await decryptOsk(
        data.organization.protected_osk, // Attention, ton API renvoie { organization: { ... } }
        cryptoStore.masterKey
    )

    const oskKey = await importOSK(decryptedOsk)

    // On la sauvegarde dans le store pour qu'elle soit accessible partout
    cryptoStore.setOrganizationKey(props.orgId, oskKey)

  } catch (err) {
    console.error("Erreur lors du chargement de l'organisation:", err)
    errorMessage.value = "Impossible de charger la clé de l'organisation."
  } finally {
    loading.value = false
  }
})

async function submitSecret() {
  errorMessage.value = ""

  // 2. Maintenant, cette ligne va fonctionner car le store a été mis à jour par onMounted !
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
    // Correction de tes variables (tu avais 'plaintext' au lieu de 'form.value.value')
    const [ciphertext, encryptedCipherKey] = await encryptOrganizationSecret(form.value.value, osk)

    const res = await fetch(`${API_BASE_URL}/org/${props.orgId}/secrets`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: props.orgId,
        name: form.value.name,
        type: form.value.type,
        ciphertext: ciphertext,          // Correction ici (ciphertext direct)
        encryptedCipherKey: encryptedCipherKey // Correction ici
      })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || "Failed to create secret")
    }

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
