<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from "vue-router"
import { API_BASE_URL } from "../components/constant.js"
import { useCryptoStore } from "../stores/crypto.store"
import { decryptOrganizationSecret, decryptOsk, importOSK } from '../function/crypto.js'

const router = useRouter()
const cryptoStore = useCryptoStore()

const props = defineProps({
  orgId: {
    type: String,
    required: true
  }
})

// États de la page
const secrets = ref([])
const loading = ref(false)
const errorMessage = ref('')
const showValues = ref({})

// États des filtres locaux
const searchQuery = ref('')
const selectedType = ref('all')

// Récupération unique de TOUS les secrets de l'organisation au montage
const fetchOrgSecrets = async () => {
  loading.value = true
  errorMessage.value = ''
  
  try {
    const res = await fetch(`${API_BASE_URL}/org/${props.orgId}/secrets`, {
      method: 'GET',
      credentials: 'include'
    })

    const data = await res.json().catch(() => ({}))

    console.log(data)

    if (!res.ok) {
      errorMessage.value = data.message || 'Failed to load organization secrets'
      return
    }

    const fetchedSecrets = data.secrets || []

    const rawOosk = await decryptOsk(data.protected_osk,cryptoStore.rsaPrivateKey)

    const osk = await importOSK(rawOosk)

    cryptoStore.setOrganizationKey(props.orgId, osk)

    // Déchiffrement initial de l'ensemble des secrets reçus
    for (const s of fetchedSecrets) {
      showValues.value[s.id] = false
      try {
        s.value = await decryptOrganizationSecret(s.ciphertext, s.encrypted_cipher_key ,osk)
      } catch (e) {
        console.error('Decrypt error for secret', s.id, e)
        s.value = '⚠️ Decryption Error'
      }
    }

    secrets.value = fetchedSecrets

  } catch (err) {
    console.error(err)
    errorMessage.value = 'Network error'
  } finally {
    loading.value = false
  }
}

const toggleValue = (id) => {
  showValues.value[id] = !showValues.value[id]
}

const handleUpdateSecret = (secretId, orgId) => {
  router.push(`/updateOrgSecret/${orgId}/${secretId}`)
}

const deleteSecret = async (secretId, orgId) => {

  console.log(secretId)
  console.log(orgId)
  if (!confirm("Delete this secret ?")) {
    return
  }

  try {
    const res = await fetch(`${API_BASE_URL}/org/secret/${secretId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orgId: props.orgId
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.message || "Failed to delete secret")
    }

    // retire immédiatement le secret de la liste
    secrets.value = secrets.value.filter(s => s.id !== secretId)

  } catch (err) {
    console.error(err)
    alert(err.message)
  }
}

// Filtrage local en synchrone basé sur le comportement de ton Home
const filteredOrgSecrets = computed(() => {
  return secrets.value.filter((s) => {
    const matchType = selectedType.value === 'all' || s.type === selectedType.value
    const matchSearch = s.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    return matchType && matchSearch
  })
})

onMounted(() => {
  if (!cryptoStore.masterKey) {
    console.warn("MasterKey not loaded yet")
    return
  }
  fetchOrgSecrets()
})
</script>

<template>
  <div class="secrets-page">
    <h2>Shared Organization Secrets</h2>
    <p style="color: #6b7280; margin-bottom: 2rem;">
      Here are all the shared secrets from the organizations you are part of.
    </p>

    <div class="top-actions">
      <button class="home-btn" @click="router.push('/home')">
        ← Back
      </button>
    </div>

    <!-- BARRE DE FILTRES SYNCHRONE -->
    <div class="secrets-controls">
      <div class="search-box">
        <input 
          v-model="searchQuery" 
          placeholder="Search shared secrets by name..." 
        />
      </div>

      <div class="filter-box">
        <select v-model="selectedType">
          <option value="all">All types</option>
          <option value="text">Text</option>
          <option value="password">Password</option>
          <option value="token">Token</option>
          <option value="identifier">Identifier</option>
          <option value="note">Note</option>
        </select>
      </div>
    </div>

    <!-- ÉTATS DE CHARGEMENT ET ERREURS -->
    <div v-if="loading" style="color: #6b7280;">Loading shared secrets...</div>
    <div v-if="errorMessage" class="error-message" style="text-align: left; margin-bottom: 1.5rem;">
      {{ errorMessage }}
    </div>

    <!-- CAS COMPTEUR À ZÉRO -->
    <div v-if="!loading && filteredOrgSecrets.length === 0" style="color: #6b7280; font-style: italic;">
      No shared secrets found matching your criteria.
    </div>

    <!-- LISTE DES CARTES -->
    <ul v-if="secrets.length > 0" class="secrets-list" style="list-style: none; padding: 0;">
      <li 
        v-for="secret in filteredOrgSecrets" 
        :key="secret.id" 
        class="secret-card"
        style="margin-bottom: 1rem;"
      >
        <div class="secret-main">
          <div class="secret-name">{{ secret.name }}</div>
          <div class="secret-type">
            Type: {{ secret.type }} 
            <span style="color: var(--primary-color); font-weight: 600;">
              · {{ secret.organization_name }}
            </span>
          </div>
        </div>

        <div class="secret-meta">
          <div>Created: {{ new Date(secret.created_at).toLocaleDateString() }}</div>
          <div>Updated: {{ new Date(secret.updated_at).toLocaleDateString() }}</div>
        </div>

        <div class="secret-value">
          {{ showValues[secret.id] ? secret.value : '••••••••••••' }}
        </div>

        <div class="secret-actions">
          <button @click="toggleValue(secret.id)">
            {{ showValues[secret.id] ? 'Hide' : 'Show' }}
          </button>
          <button @click="handleUpdateSecret(secret.id, props.orgId)">
            Update
          </button>
          <button @click="deleteSecret(secret.id, props.orgId)">
            Delete
        </button>
        </div>
      </li>
    </ul>
  </div>
</template>