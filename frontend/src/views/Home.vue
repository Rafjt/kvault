<script setup>
// TODO: voir pk le déchiffrement marche pas 
import { ref, onMounted } from 'vue'
import { API_BASE_URL } from "../components/constant.js";
import { useCryptoStore } from "../stores/crypto.store";
import { useRouter } from "vue-router"
import { deleteSecret } from '../function/function'

const router = useRouter()

const cryptoStore = useCryptoStore();

const secrets = ref([])
const loading = ref(false)
const errorMessage = ref('')
const showValues = ref({}) // toggle pour chaque secret

// Déchiffre AES-GCM (ciphertext Base64) avec masterKey
async function decryptSecret(ciphertextB64, nonceB64) {
  const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(nonceB64), c => c.charCodeAt(0));

  if (!cryptoStore.masterKey) {
    throw new Error("MasterKey not loaded") ;
  } else {
    console.log("Masterkey loaded");
  }

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128 // AES-GCM standard
    },
    cryptoStore.masterKey, // maintenant c’est un CryptoKey
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

async function createsec() {
    router.push('/create')
}

async function handleDeleteSecret(secretId) {
  try {
    await deleteSecret(secretId)

    secrets.value = secrets.value.filter(s => s.id !== secretId)

    delete showValues.value[secretId]

  } catch (err) {
    console.error("Delete failed", err)
    errorMessage.value = "Failed to delete secret"
  }
}

async function handleUpdateSecret(secretId) {
  router.push(`/update/${secretId}`)
}


const fetchSecrets = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const res = await fetch(`${API_BASE_URL}/secrets`, {
      method: 'GET',
      credentials: 'include'
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || 'Failed to load secrets'
    } else {
      secrets.value = data.secrets || []

      // Initialiser le toggle et déchiffrer les secrets
      for (const s of secrets.value) {
        //console.log("cipher length:", ciphertext.length)
        showValues.value[s.id] = false
        try {
          s.value = await decryptSecret(s.ciphertext, s.nonce)
        } catch (e) {
          
          console.error('Decrypt error for secret', s.id, e)
          s.value = 'ERROR'
        }
      }
    }
  } catch (err) {
    errorMessage.value = 'Network error'
  } finally {
    loading.value = false
  }
}

// Toggle show/hide
const toggleValue = (id) => {
  showValues.value[id] = !showValues.value[id]
}

onMounted(async () => {
  // Attendre que la masterKey soit prête
  if (!cryptoStore.masterKey) {
    console.warn("MasterKey not loaded yet")
    return
  }
  await fetchSecrets()
})

</script>

<template>
  <div class="secrets-page">
    <h2>Your Secrets</h2>
    <button class="create-btn" @click="createsec">
      + Create secret
    </button>
    <div v-if="loading">Loading secrets...</div>
    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>

    <div v-if="!loading && secrets.length === 0">
      <p>No secrets found.</p>
    </div>

    <ul v-if="secrets.length > 0" class="secrets-list">
      <li
        v-for="secret in secrets"
        :key="secret.id"
        class="secret-card"
      >
        <div class="secret-main">
          <div class="secret-name">{{ secret.name }}</div>
          <div class="secret-type">{{ secret.type }}</div>
        </div>

        <div class="secret-meta">
          <div>Created: {{ new Date(secret.created_at).toLocaleDateString() }}</div>
          <div>Updated: {{ new Date(secret.updated_at).toLocaleDateString() }}</div>
        </div>

        <div class="secret-value">
          {{ showValues[secret.id] ? secret.value : '************' }}
        </div>

        <div class="secret-actions">
          <button @click="toggleValue(secret.id)">
            {{ showValues[secret.id] ? 'Hide' : 'Show' }}
          </button>
          <button @click="handleUpdateSecret(secret.id)">
            Update
          </button>
          <button @click="handleDeleteSecret(secret.id)">
            delete
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>