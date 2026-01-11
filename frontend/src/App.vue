<script setup>
import { ref } from 'vue'
import Register from './components/Register.vue'

const showRegister = ref(false)

// login state
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
      body: JSON.stringify({ email: email.value, password: password.value })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      errorMessage.value = data.message || data.error || 'Login failed'
    } else {
      successMessage.value = data.message || 'Login successful'
      console.log('crypto:', data.crypto)
    }
  } catch (err) {
    errorMessage.value = 'Network error'
  } finally {
    loading.value = false
  }
}

const openRegister = () => { showRegister.value = true }
const backToLogin = () => { showRegister.value = false }

const onRegistered = () => {
  // after successful registration, return to login
  showRegister.value = false
  successMessage.value = 'Registration successful. Please verify your email before logging in.'
}
</script>

<template>
  <div>
    <div>
      <h1>Welcome To KVAULT</h1>
    </div>

    <Register v-if="showRegister" @back="backToLogin" @registered="onRegistered" />

    <div v-if="!showRegister">
      <h2>Login</h2>

      <div v-if="errorMessage" style="color: #b91c1c">{{ errorMessage }}</div>
      <div v-if="successMessage" style="color: #064e3b">{{ successMessage }}</div>

      <form @submit="onSubmit">
        <div>
          <label for="email">Email</label>
          <input v-model="email" type="email" id="email" required />
        </div>

        <div>
          <label for="password">Password</label>
          <input v-model="password" type="password" id="password" required />
        </div>

        <p>
          <a href="#">Forgot my password</a>
        </p>

        <p>
          <a href="#" @click.prevent="openRegister">Don't have an account? Register</a>
        </p>

        <button type="submit" :disabled="loading">{{ loading ? 'Logging in...' : 'Login' }}</button>
      </form>
    </div>
  </div>
</template>
