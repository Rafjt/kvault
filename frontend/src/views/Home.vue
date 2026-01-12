<script setup>
import { ref, onMounted } from 'vue'
import { API_BASE_URL } from "../components/constant.js";
// TODO: Gérér le dechiffrement via la gestion de clé de chiffrement
const secrets = ref([])
const loading = ref(false)
const errorMessage = ref('')

const fetchSecrets = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const res = await fetch(`${API_BASE_URL}/secrets`, {
      method: 'GET',
      credentials: 'include' // cookie auth
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || 'Failed to load secrets'
    } else {
      secrets.value = data.secrets || []
    }
  } catch (err) {
    errorMessage.value = 'Network error'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSecrets()
})
</script>

<template>
  <div>
    <h2>Your Secrets</h2>

    <div v-if="loading">Loading secrets...</div>
    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>

    <div v-if="!loading && secrets.length === 0">
      <p>No secrets found.</p>
    </div>

    <ul v-if="secrets.length > 0" style="list-style:none; padding:0">
      <li v-for="secret in secrets" :key="secret.id" style="margin-bottom: 1em; border:1px solid #e5e7eb; padding: 0.5em; border-radius:0.5em;">
        <div>
          <strong>Name:</strong> {{ secret.name }}
        </div>
        <div>
          <strong>Type:</strong> {{ secret.type }}
        </div>
        <div>
          <strong>Created:</strong>
          {{ new Date(secret.created_at).toLocaleString() }}
        </div>
        <div>
          <strong>Last update:</strong>
          {{ new Date(secret.updated_at).toLocaleString() }}
        </div>
      </li>
    </ul>
  </div>
</template>
