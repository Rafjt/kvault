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
    const res = await fetch('http://localhost:2111/auth/register', {
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
      errorMessage.value =
        data.message || data.error || data.errors || 'Registration failed'
    } else {
      successMessage.value =
        data.message || 'Registration successful. Check your email.'

      // retour login après 1.5s
      setTimeout(() => {
        router.push('/login')
      }, 5000)
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
    <h2>Register</h2>

    <div v-if="errorMessage" style="color:#b91c1c">{{ errorMessage }}</div>
    <div v-if="successMessage" style="color:#064e3b">{{ successMessage }}</div>

    <form @submit="onSubmit">
      <div>
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>

      <div>
        <label>Password</label>
        <input v-model="password" type="password" required minlength="8" />
      </div>

      <p>
        <router-link to="/login">Back to login</router-link>
      </p>

      <button :disabled="loading">
        {{ loading ? 'Registering...' : 'Register' }}
      </button>
    </form>
  </div>
</template>
