<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const loading = ref(false)

const onSubmit = async (e) => {
  e.preventDefault()
  errorMessage.value = ''
  successMessage.value = ''
  loading.value = true

  try {
    const res = await fetch('http://localhost:2111/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || data.error || 'Login failed'
    } else {
      successMessage.value = data.message || 'Login successful'
      console.log('crypto:', data.crypto)

      router.push('/home')

    }
  } catch {
    errorMessage.value = 'Network error'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2>Login</h2>

    <div v-if="errorMessage" style="color:#b91c1c">{{ errorMessage }}</div>
    <div v-if="successMessage" style="color:#064e3b">{{ successMessage }}</div>

    <form @submit="onSubmit">
      <div>
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>

      <div>
        <label>Password</label>
        <input v-model="password" type="password" required />
      </div>

      <p>
        <router-link to="/register">
          Don't have an account? Register
        </router-link>
      </p>

      <button :disabled="loading">
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>
    </form>
  </div>
</template>
