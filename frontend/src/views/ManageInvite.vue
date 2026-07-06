<script setup>
import { ref, onMounted } from 'vue'
import { API_BASE_URL } from "../components/constant.js";
import { useRouter } from "vue-router"

const router = useRouter()

const invitations = ref([])
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Charger les invitations en attente
const fetchPendingInvitations = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/org/invitations/pending`, {
      credentials: "include"
    })

    const data = await res.json()

    if (res.ok) {
      invitations.value = data.invitations || []
    } else {
      errorMessage.value = data.message || "Failed to load invitations."
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = "Network error while fetching invitations."
  } finally {
    loading.value = false
  }
}

// Accepter une invitation
async function handleAccept(token) {
  errorMessage.value = ''
  successMessage.value = ''
  
  if (!confirm("Are you sure you want to join this organization?")) return

  try {
    // Appel de ton API en passant le token directement dans l'URL
    const res = await fetch(`${API_BASE_URL}/invite/${token}/accept`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.message || "Failed to accept the invitation.")
    }

    successMessage.value = "You successfully joined the organization, once the owner confirms your request you will be able to access the organisation secrets !"
    // Filtrer la liste localement pour retirer l'invitation validée
    invitations.value = invitations.value.filter(i => i.token !== token)
    
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message
  }
}

function goBack() {
  router.push('/home')
}

onMounted(() => {
  fetchPendingInvitations()
})
</script>

<template>
  <div class="secrets-page">
    
    <section class="page-section">
      <div class="header-zone">
        <button class="back-btn" @click="goBack">← Back to Dashboard</button>
        <h2>Manage Your Invitations</h2>
      </div>

      <!-- Messages Flash -->
      <div v-if="errorMessage" class="message-banner error-msg">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="message-banner success-msg">
        {{ successMessage }}
      </div>

      <!-- État de chargement -->
      <div v-if="loading" class="loading-state">
        Loading invitations...
      </div>

      <!-- Pas d'invitations -->
      <div v-if="!loading && invitations.length === 0" class="empty-state">
        <p>You have no pending invitations at the moment.</p>
        <button class="action-btn" @click="goBack">Return to dashboard</button>
      </div>

      <!-- Liste des invitations -->
      <div v-if="invitations.length > 0" class="invitations-list">
        <div 
          v-for="invite in invitations" 
          :key="invite.invitation_id" 
          class="secret-card"
        >
          <div class="secret-main">
            <div class="secret-name">
              Invitation to join: <strong>{{ invite.organization_name }}</strong>
            </div>
            
            <div class="secret-type" style="color: #666; margin-top: 5px;">
              Invited by: <span>{{ invite.sender_login }}</span><br>
              Target Role: <span class="role-badge">{{ invite.invited_role }}</span>
            </div>

            <div class="invite-expiry">
              Expires on: {{ new Date(invite.expires_at).toLocaleString() }}
            </div>
          </div>

          <div class="secret-actions">
            <button class="accept-btn" @click="handleAccept(invite.token)">
              Accept
            </button>
          </div>
        </div>
      </div>

    </section>
  </div>
</template>