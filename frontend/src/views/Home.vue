<script setup>
import { ref, onMounted, computed } from 'vue'
import { API_BASE_URL } from "../components/constant.js";
import { useCryptoStore } from "../stores/crypto.store";
import { useRouter } from "vue-router"
import { deleteSecret } from '../function/function'
import { decryptSecret } from '../function/crypto.js';

const router = useRouter();

const cryptoStore = useCryptoStore();

const secrets = ref([])
const loading = ref(false)
const errorMessage = ref('')
const showValues = ref({}) // toggle pour chaque secret
const searchQuery = ref('')
const selectedType = ref('all')
const organizations = ref([])
const showOrgValues = ref({})

async function createOrg() {
  router.push("/createOrg")
}

async function createsec() {
  router.push("/create");
}

async function redirectToChangePassword() {
  router.push("/change-password");
}

async function handleDeleteSecret(secretId) {
  try {
    await deleteSecret(secretId);

    secrets.value = secrets.value.filter((s) => s.id !== secretId);

    delete showValues.value[secretId];
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
      console.log(organizations)
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

    console.log("New decrypt secret")

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || "Failed to load secrets";
    } else {
      secrets.value = data.secrets || [];

      // Initialiser le toggle et déchiffrer les secrets
      for (const s of secrets.value) {
        //console.log("cipher length:", ciphertext.length)
        showValues.value[s.id] = false;
        try {
          s.value = await decryptSecret(s.ciphertext, s.nonce, cryptoStore.masterKey)
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

// Toggle show/hide
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

const toggleOrgValue = (id) => {
  showOrgValues.value[id] = !showOrgValues.value[id]
}

</script>

<template>
  <div class="secrets-page">
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

          <div class="secret-type">
            {{ org.secret_count }} secret(s)
          </div>

        </div>

        <div
          v-if="org.secret_count === 0"
          style="margin-top:1rem"
        >

          <p>No secret yet.</p>

          <button
            @click="router.push(`/createOrgSecret/${org.id}`)"
          >
            + Create first secret
          </button>

        </div>

      </div>

    </div>
    <h2>Your Secrets</h2>
    <button class="create-btn" @click="createsec">
      + Create secret
    </button>
    <div v-if="loading">Loading secrets...</div>
    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>
    <section class="page-section">
      <h2>Your account</h2>

      <div class="secrets-controls">
        <button class="action-btn logout-btn" @click="reloadPage">
          Logout
        </button>

        <button
          class="action-btn reset-btn"
          @click="redirectToChangePassword()"
        >
          Change password
        </button>
      </div>
    </section>

    <!-- ===================== -->
    <!-- SECRETS SECTION -->
    <!-- ===================== -->
    <section class="page-section">
      <h2>Your secrets</h2>

      <button class="create-btn" @click="createsec">+ Create secret</button>

      <div v-if="loading">Loading secrets...</div>

      <div v-if="errorMessage" style="color: #b91c1c">
        {{ errorMessage }}
      </div>

      <div v-if="!loading && filteredSecrets.length === 0">
        <p>No matching secrets found.</p>
      </div>

      <!-- KEEP YOUR EXISTING CONTROLS -->
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

      <ul v-if="secrets.length > 0" class="secrets-list">
        <li
          v-for="secret in filteredSecrets"
          :key="secret.id"
          class="secret-card"
        >
          <div class="secret-main">
            <div class="secret-name">{{ secret.name }}</div>
            <div class="secret-type">{{ secret.type }}</div>
          </div>

          <div class="secret-meta">
            <div>
              Created: {{ new Date(secret.created_at).toLocaleDateString() }}
            </div>
            <div>
              Updated: {{ new Date(secret.updated_at).toLocaleDateString() }}
            </div>
          </div>

          <div class="secret-value">
            {{ showValues[secret.id] ? secret.value : "************" }}
          </div>

          <div class="secret-actions">
            <button @click="toggleValue(secret.id)">
              {{ showValues[secret.id] ? "Hide" : "Show" }}
            </button>
            <button @click="handleUpdateSecret(secret.id)">Update</button>
            <button @click="handleDeleteSecret(secret.id)">delete</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
