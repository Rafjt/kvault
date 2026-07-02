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

// Stockage de l'input d'invitation par organisation { [orgId]: 'email/user' }
const inviteInputs = ref({})

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
  const targetUser = inviteInputs.value[orgId]
  if (!targetUser || !targetUser.trim()) {
    alert("Please enter a valid user login or email.")
    return
  }

  try {
    const res = await fetch(`${API_BASE_URL}/org/${orgId}/invite`, {
      method: 'POST',
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userLogin: targetUser })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || "Failed to invite member")
    }

    alert(`Invitation sent successfully to ${targetUser}!`)
    inviteInputs.value[orgId] = "" // Reset l'input
  } catch (err) {
    console.error("Invite failed", err)
    alert(err.message || "Failed to invite member")
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

const fetchOrganizations = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/org`, {
      credentials: "include"
    })
    const data = await res.json()
    if (res.ok) {
      organizations.value = data.organizations
      // Initialiser les inputs d'invitation vides pour chaque org
      organizations.value.forEach(org => {
        inviteInputs.value[org.id] = ""
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
          console.error('Decrypt error for secret', s.id, e)
          s.value = 'ERROR'
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

    const matchType =
      selectedType.value === "all" || s.type === selectedType.value;

    const matchSearch = s.name
      .toLowerCase()
      .includes(searchQuery.value.toLowerCase());

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
    <!-- ORGANIZATIONS -->
    <!-- ===================== -->
    <section class="page-section">
      <h2>Your Organizations</h2>

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

            <div class="secret-type" style="color:#666">
              {{ org.secret_count }} secret(s)
              —
              Role:
              <strong>{{ org.role }}</strong>
            </div>
          </div>

          <div
            v-if="org.role === 'owner' || org.role === 'admin'"
            class="org-invite-zone"
          >
            <input
              v-model="inviteInputs[org.id]"
              type="text"
              placeholder="User login to invite..."
            />

            <button @click="handleInviteMember(org.id)">
              Invite
            </button>
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
    <!-- ACCOUNT -->
    <!-- ===================== -->
    <section class="page-section">
      <h2>Your account</h2>

      <div class="secrets-controls">
        <button
          class="action-btn logout-btn"
          @click="reloadPage"
        >
          Logout
        </button>

        <button
          class="action-btn reset-btn"
          @click="redirectToChangePassword"
        >
          Change password
        </button>
      </div>
    </section>

    <!-- ===================== -->
    <!-- SECRETS -->
    <!-- ===================== -->
    <section class="page-section">

      <h2>Your Secrets</h2>

      <button
        class="create-btn"
        @click="createsec"
      >
        + Create secret
      </button>

      <div v-if="loading">
        Loading secrets...
      </div>

      <div
        v-if="errorMessage"
        style="color:#b91c1c"
      >
        {{ errorMessage }}
      </div>

      <div class="secrets-controls">

        <div class="search-box">
          <input
            v-model="searchQuery"
            placeholder="Search by name..."
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

      <div
        v-if="!loading && filteredSecrets.length === 0"
      >
        <p>No matching secrets found.</p>
      </div>

      <ul
        v-if="filteredSecrets.length > 0"
        class="secrets-list"
      >
        <li
          v-for="secret in filteredSecrets"
          :key="secret.id"
          class="secret-card"
        >
          <div class="secret-main">
            <div class="secret-name">
              {{ secret.name }}
            </div>

            <div class="secret-type">
              {{ secret.type }}
            </div>
          </div>

          <div class="secret-meta">
            <div>
              Created:
              {{ new Date(secret.created_at).toLocaleDateString() }}
            </div>

            <div>
              Updated:
              {{ new Date(secret.updated_at).toLocaleDateString() }}
            </div>
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
              Delete
            </button>
          </div>

        </li>
      </ul>

    </section>

  </div>
</template>
