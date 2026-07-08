<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { API_BASE_URL } from "../components/constant.js"
import { useCryptoStore } from "../stores/crypto.store"
import { decryptOsk } from "../function/crypto.js"

const route = useRoute()
const router = useRouter()
const cryptoStore = useCryptoStore()

const props = defineProps({
  orgId: {
    type: String,
    required: true
  }
})

const orgId = ref('')
const organization = ref(null)
const pendingUsers = ref([])
const loading = ref(false)
const errorMessage = ref('')
const processingId = ref(null)

// Version ultra simple (l'exact inverse de ton register)
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

const fetchOrganizationDetails = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/org/${orgId.value}`, {
      credentials: "include"
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || "Failed to fetch organization details")
    organization.value = data.organization || null
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "An error occurred while loading organization details."
  }
}

const fetchPendingConfirmations = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/org/${orgId.value}/invitations/pending-confirm`, {
      credentials: "include"
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || "Failed to fetch pending confirmations")
    pendingUsers.value = data || []
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "An error occurred while loading pending confirmations."
  }
}

const initPage = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    await Promise.all([
      fetchOrganizationDetails(),
      fetchPendingConfirmations()
    ])
  } catch (err) {
    console.error("Init page error", err)
  } finally {
    loading.value = false
  }
}

const handleConfirmUser = async (user) => {
  processingId.value = user.invitation_id
  errorMessage.value = ''

  try {
    if (!cryptoStore.masterKey) {
      throw new Error("MasterKey not loaded. Please reconnect.")
    }
    if (!organization.value?.protected_osk) {
      throw new Error("Cannot find OSK. Please reconnect.")
    }
    if (!user.rsa_public_key) {
      throw new Error("Cannot find users public key. Please reconnect.")
    }

    // 🔬 DÉBOGAGE : On regarde la structure exacte reçue pour l'OSK avant de l'envoyer à decryptOsk
    console.log("Structure brute de protected_osk:", organization.value.protected_osk)

    // ÉTAPE A : Déchiffrer l'OSK de l'organisation
    const oskRawBuffer = await decryptOsk(organization.value.protected_osk, cryptoStore.rsaPrivateKey)

    // ÉTAPE B : Importer la clé publique du nouvel utilisateur (reçue en Base64 pur)
    console.log("Public key :", user.rsa_public_key)
    console.log("Type :", typeof user.rsa_public_key)
    const userPublicKeyBuffer = base64ToArrayBuffer(user.rsa_public_key)
    const importedUserPublicKey = await crypto.subtle.importKey(
      "spki",
      userPublicKeyBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256"
      },
      false,
      ["encrypt"]
    )

    // ÉTAPE C : Chiffrer l'OSK pour le nouvel utilisateur avec sa clé RSA publique
    const encryptedOskBuffer = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      importedUserPublicKey,
      oskRawBuffer
    )

    // ÉTAPE D : Convertir en Base64 (exactement comme dans ton register)
    const base64ProtectedOsk = btoa(
      String.fromCharCode(...new Uint8Array(encryptedOskBuffer))
    )

    // ÉTAPE E : Envoi au serveur
    const res = await fetch(`${API_BASE_URL}/org/${orgId.value}/invitations/${user.invitation_id}/confirm`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        protected_osk: base64ProtectedOsk
      })
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || "Failed to confirm user")

    alert(data.message || "User access confirmed successfully!")
    pendingUsers.value = pendingUsers.value.filter(u => u.invitation_id !== user.invitation_id)

  } catch (err) {
    console.error("Crypto/Transmission Error:", err)
    alert(err.message)
  } finally {
    processingId.value = null
  }
}

function goBack() {
  router.push('/home')
}

onMounted(() => {
  const targetId = props.orgId || route.params.orgid
  if (targetId) {
    orgId.value = targetId
    initPage()
  } else {
    errorMessage.value = "Invalid Organization ID."
  }
})
</script>

<template>
  <div class="secrets-page">
    <section class="page-section">
      <div class="section-header-row">
        <h2>Confirmations for {{ organization ? organization.name : 'Organization' }}</h2>
        <button class="action-btn-sec" @click="goBack">Back to Home</button>
      </div>

      <p class="section-description">
        The users below have accepted your invitation. To finalize their membership, you must transmit their copy of the Organization Security Key (OSK), encrypted with their public key.
      </p>

      <div v-if="loading" class="status-msg">
        Loading data...
      </div>

      <div v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </div>

      <div v-if="!loading && pendingUsers.length === 0" class="empty-state">
        <p>No pending confirmations found for this organization.</p>
        <button class="action-btn-sec btn-inline" @click="goBack">Return home</button>
      </div>

      <div v-if="!loading && pendingUsers.length > 0" class="user-confirm-list">
        <div 
          v-for="user in pendingUsers" 
          :key="user.invitation_id" 
          class="user-confirm-card"
        >
          <div class="user-info">
            <div class="user-login">
              {{ user.login }}
            </div>
            <div class="user-role-meta">
              Assigned Role: <span class="role-badge">{{ user.assigned_role }}</span>
            </div>
            <div class="user-crypto-status" :class="{ 'status-ok': user.rsa_public_key, 'status-error': !user.rsa_public_key }">
              <span>Public Key Status:</span> {{ user.rsa_public_key ? '✓ Ready to encrypt' : '✗ Missing key' }}
            </div>
          </div>

          <div class="user-actions-zone">
            <button 
              class="confirm-submit-btn"
              :disabled="processingId === user.invitation_id || !user.rsa_public_key || !organization?.protected_osk"
              @click="handleConfirmUser(user)"
            >
              {{ processingId === user.invitation_id ? 'Encrypting & Sending...' : 'Confirm & Transmit Key' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
button:disabled {
  background-color: #cccccc !important;
  cursor: not-allowed;
}
</style>