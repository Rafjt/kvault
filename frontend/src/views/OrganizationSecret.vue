<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from "vue-router"
import {
  fetchOrganizationSecrets,
  deleteOrganizationSecret
} from "../function/function"
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

const secrets = ref([])
const loading = ref(false)
const errorMessage = ref('')
const showValues = ref({})

const orgOsk = ref(null)

const searchQuery = ref('')
const selectedType = ref('all')

const loadOrgSecrets = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const data = await fetchOrganizationSecrets(props.orgId)

    const fetchedSecrets = data.secrets || []

    const rawOosk = await decryptOsk(
      data.protected_osk,
      cryptoStore.rsaPrivateKey
    )

    const osk = await importOSK(rawOosk)

    cryptoStore.setOrganizationKey(props.orgId, osk)
    orgOsk.value = osk

    for (const s of fetchedSecrets) {
      showValues.value[s.id] = false
      s.value = null
    }

    secrets.value = fetchedSecrets

  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "Network error"

  } finally {
    loading.value = false
  }
}

const toggleValue = async (secret) => {
  if (!showValues.value[secret.id]) {
    try {
      secret.value = 'Decrypting...'

      if (!orgOsk.value) throw new Error("Organization key not available")
      
      secret.value = await decryptOrganizationSecret(
        secret.ciphertext, 
        secret.encrypted_cipher_key, 
        orgOsk.value
      )
    } catch (e) {
      console.error('Decrypt error for secret', secret.id, e)
      secret.value = '⚠️ Decryption Error'
    }
  } 

  else {

    secret.value = null
  }

  showValues.value[secret.id] = !showValues.value[secret.id]
}

const handleUpdateSecret = (secretId, orgId) => {
  router.push(`/updateOrgSecret/${orgId}/${secretId}`)
}

const handleDeleteSecret = async (secretId) => {
  if (!confirm("Delete this secret ?")) {
    return
  }

  try {
    await deleteOrganizationSecret(secretId, props.orgId)

    secrets.value = secrets.value.filter(
      s => s.id !== secretId
    )

    delete showValues.value[secretId]

  } catch (err) {
    console.error(err)
    alert(err.message)
  }
}

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
  loadOrgSecrets()
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

    <div v-if="loading" style="color: #6b7280;">Loading shared secrets...</div>
    <div v-if="errorMessage" class="error-message" style="text-align: left; margin-bottom: 1.5rem;">
      {{ errorMessage }}
    </div>

    <div v-if="!loading && filteredOrgSecrets.length === 0" style="color: #6b7280; font-style: italic;">
      No shared secrets found matching your criteria.
    </div>

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
          <button @click="toggleValue(secret)">
            {{ showValues[secret.id] ? 'Hide' : 'Show' }}
          </button>
          <button @click="handleUpdateSecret(secret.id, props.orgId)">
            Update
          </button>
          <button @click="handleDeleteSecret(secret.id)">
            Delete
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>