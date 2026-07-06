<script setup>
import { ref, onMounted, computed } from 'vue'
import { API_BASE_URL } from "../components/constant.js";
import { useCryptoStore } from "../stores/crypto.store";
import { useRouter } from "vue-router"
import { deleteSecret } from '../function/function'
import { decryptSecret } from '../function/crypto.js';

const router = useRouter()
const cryptoStore = useCryptoStore();

const secrets = ref([])
const loading = ref(false)
const errorMessage = ref('')
const showValues = ref({}) 
const searchQuery = ref('')
const selectedType = ref('all')
const organizations = ref([])
const showOrgValues = ref({})
const invitations = ref([])

// AJOUT : Stocke le nombre de validations d'accès en attente par organisation { [orgId]: count }
const pendingConfirmationsCount = ref({})

// Stockage de l'input d'invitation par organisation { [orgId]: 'email/user' }
const inviteForms = ref({})

async function createOrg() {
  router.push("/createOrg")
}

async function createsec() {
  router.push("/create");
}

async function redirectToChangePassword() {
  router.push("/change-password");
}

// Fonction pour gérer l'invitation d'un membre
async function handleInviteMember(orgId) {
  const form = inviteForms.value[orgId]

  if (!form.email.trim()) {
    alert("Please enter an email address.")
    return
  }

  try {
    const res = await fetch(`${API_BASE_URL}/org/${orgId}/invite`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: form.email,
        role: form.role
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.message || "Failed to send invitation")
    }

    alert("Invitation sent successfully!")
    form.email = ""
    form.role = "member"

  } catch (err) {
    console.error(err)
    alert(err.message)
  }
}

async function handleDeleteOrg(orgId) {
  if (!confirm("Are you sure you want to delete this organization? This will delete all its secrets.")) {
    return
  }

  try {
    const res = await fetch(`${API_BASE_URL}/org/${orgId}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || "Failed to delete organization")
    }

    organizations.value = organizations.value.filter(o => o.id !== orgId)
  } catch (err) {
    console.error("Delete organization failed", err)
    errorMessage.value = err.message || "Failed to delete organization"
  }
}

async function handleDeleteSecret(secretId) {
  try {
    await deleteSecret(secretId)
    secrets.value = secrets.value.filter(s => s.id !== secretId)
    delete showValues.value[secretId]
  } catch (err) {
    console.error("Delete failed", err);
    errorMessage.value = "Failed to delete secret";
  }
}

async function handleUpdateSecret(secretId) {
  router.push(`/update/${secretId}`);
}

// AJOUT : Vérifie s'il y a des clés à transmettre pour les admins
const fetchPendingConfirmations = async (orgId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/org/${orgId}/invitations/pending-confirm`, {
      credentials: "include"
    })
    if (res.ok) {
      const data = await res.json()
      pendingConfirmationsCount.value[orgId] = data.length || 0
    }
  } catch (err) {
    console.error(`Failed to fetch pending confirmations for org ${orgId}:`, err)
  }
}

const fetchOrganizations = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/org`, {
      credentials: "include"
    })

    const data = await res.json()

    if (res.ok) {
      organizations.value = data.organizations || []
      invitations.value = data.invitations || [] 

      // Initialisation des formulaires d'invitation et check des confirmations requises
      organizations.value.forEach(org => {
        inviteForms.value[org.id] = {
          email: "",
          role: "member"
        }

        // Si l'utilisateur est admin/owner, on regarde s'il doit valider des arrivants
        if (org.role === 'owner' || org.role === 'admin') {
          fetchPendingConfirmations(org.id)
        }
      })
    }
  } catch (err) {
    console.error(err)
  }
}

const fetchSecrets = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const res = await fetch(`${API_BASE_URL}/secrets`, {
      method: "GET",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || "Failed to load secrets";
    } else {
      secrets.value = data.secrets || [];

      for (const s of secrets.value) {
        showValues.value[s.id] = false

        try {
          s.value = await decryptSecret(s.ciphertext, cryptoStore.masterKey)
        } catch (e) {
          console.error("Decrypt error for secret", s.id, e);
          s.value = "ERROR";
        }
      }
    }
  } catch (err) {
    errorMessage.value = "Network error";
  } finally {
    loading.value = false;
  }
};

const toggleValue = (id) => {
  showValues.value[id] = !showValues.value[id];
};

const filteredSecrets = computed(() => {
  return secrets.value.filter((s) => {
    const matchType = selectedType.value === "all" || s.type === selectedType.value;
    const matchSearch = s.name.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchType && matchSearch;
  });
});

const reloadPage = () => location.reload();

onMounted(async () => {
  if (!cryptoStore.masterKey) {
    console.warn("MasterKey not loaded yet");
    return;
  }

  await Promise.all([
    fetchSecrets(),
    fetchOrganizations()
  ])
})
</script>

<template>
  <div class="secrets-page">

    <!-- ===================== -->
    <!-- ORGANIZATIONS         -->
    <!-- ===================== -->
    <section class="page-section">
      <h2>Your Organizations</h2>

      <!-- Bannière de notification d'invitation (Reçues par l'utilisateur) -->
      <div v-if="invitations.length > 0" class="invitation-alert-banner">
        <div class="alert-content">
          <span>✉️ You have <strong>{{ invitations.length }}</strong> pending organization invitation(s).</span>
          <button class="alert-action-btn" @click="router.push('/manageInvite')">
            Manage Invitations
          </button>
        </div>
      </div>

      <div v-if="organizations.length === 0">
        <p>You are not a member of any organization.</p>
        <button @click="createOrg">
          + Create an organization
        </button>
      </div>

      <div v-else>
        <div
          v-for="org in organizations"
          :key="org.id"
          class="secret-card"
        >
          <div class="secret-main">
            <div class="secret-name">
              {{ org.name }}
            </div>
            
            <!-- AJOUT : Alerte d'action pour l'admin (Clés de sécurité en attente d'envoi) -->
            <div 
              v-if="pendingConfirmationsCount[org.id] > 0" 
              class="pending-confirm-badge"
              style="background-color: #fef3c7; color: #92400e; padding: 10px; border-radius: 6px; margin: 8px 0; border: 1px solid #fcd34d;"
            >
              ⚠️ <strong>{{ pendingConfirmationsCount[org.id] }} user(s)</strong> accepted entry. You must transmit their security key to complete their access.
              <button 
                style="margin-left: 10px; background: #d97706; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;"
                @click="router.push(`/org/${org.id}/confirmations`)"
              >
                Transmit Keys
              </button>
            </div>

            <div
              v-if="(org.role === 'owner' || org.role === 'admin') && inviteForms[org.id]"
              class="org-invite-zone"
            >
              <input
                v-model="inviteForms[org.id].email"
                type="email"
                placeholder="Email address"
              />

              <select v-model="inviteForms[org.id].role">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>

              <button @click="handleInviteMember(org.id)">
                Invite
              </button>
            </div>

            <div class="secret-type" style="color:#666">
              {{ org.secret_count }} secret(s) — Role: <strong>{{ org.role }}</strong>
            </div>
          </div>

          <div v-if="org.secret_count === 0">
            No secret yet.
          </div>

          <div class="secret-actions">
            <button @click="router.push(`/org/${org.id}`)">
              Inspect
            </button>

            <button @click="router.push(`/createOrgSecret/${org.id}`)">
              {{ org.secret_count === 0 ? '+ Create first secret' : '+ Add secret' }}
            </button>

            <button
              v-if="org.role === 'owner' || org.role === 'admin'"
              @click="handleDeleteOrg(org.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== -->
    <!-- SECRETS               -->
    <!-- ===================== -->
    <section class="page-section">
      <h2>Your Secrets</h2>

      <button class="create-btn" @click="createsec">
        + Create secret
      </button>

      <div v-if="loading">Loading secrets...</div>

      <div v-if="errorMessage" style="color:#b91c1c">
        {{ errorMessage }}
      </div>

      <div class="secrets-controls">
        <div class="search-box">
          <input v-model="searchQuery" placeholder="Search by name..." />
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

      <div v-if="!loading && filteredSecrets.length === 0">
        <p>No matching secrets found.</p>
      </div>

      <ul v-if="filteredSecrets.length > 0" class="secrets-list">
        <li v-for="secret in filteredSecrets" :key="secret.id" class="secret-card">
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
            <button @click="handleUpdateSecret(secret.id)">Update</button>
            <button @click="handleDeleteSecret(secret.id)">Delete</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ===================== -->
    <!-- ACCOUNT               -->
    <!-- ===================== -->
    <section class="page-section">
      <h2>Your account</h2>
      <div class="secrets-controls">
        <button class="action-btn logout-btn" @click="reloadPage">Logout</button>
        <button class="action-btn reset-btn" @click="redirectToChangePassword">Change password</button>
      </div>
    </section>

  </div>
</template>