<script setup>
import { ref, onMounted } from 'vue'
import {
  fetchPendingInvitations,
  acceptInvitation
} from "../function/function"
import { useRouter } from "vue-router"

const router = useRouter()

const invitations = ref([])
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const loadPendingInvitations = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    invitations.value = await fetchPendingInvitations()

  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || "Network error while fetching invitations."

  } finally {
    loading.value = false
  }
}

async function handleAccept(token) {
  errorMessage.value = ''
  successMessage.value = ''
  
  if (!confirm("Are you sure you want to join this organization?")) return

  try {
    await acceptInvitation(token)

    successMessage.value = "You successfully joined the organization, once the owner confirms your request you will be able to access the organisation secrets !"
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
  loadPendingInvitations()
})
</script>

<template>
  <div class="secrets-page">
    
    <section class="page-section">
      <div class="header-zone">
        <button class="back-btn" @click="goBack">← Back to Dashboard</button>
        <h2>Manage Your Invitations</h2>
      </div>

      <div v-if="errorMessage" class="message-banner error-msg">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="message-banner success-msg">
        {{ successMessage }}
      </div>

      <div v-if="loading" class="loading-state">
        Loading invitations...
      </div>

      <div v-if="!loading && invitations.length === 0" class="empty-state">
        <p>You have no pending invitations at the moment.</p>
      </div>

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