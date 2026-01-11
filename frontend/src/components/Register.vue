<script setup>
import { ref } from 'vue'
const emit = defineEmits(['back','registered'])

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
      body: JSON.stringify({ email: email.value, password: password.value })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      errorMessage.value = data.message || data.error || data.errors || 'Registration failed'
    } else {
      successMessage.value = data.message || 'Registration successful. Check your email.'
      // notify parent that registration succeeded
      emit('registered')
    }
  } catch (err) {
    errorMessage.value = 'Network error'
  } finally {
    loading.value = false
  }
}

const goBack = () => emit('back')
</script>

<template>
  <div>
    <div>
      <h1>Register to KVAULT</h1>
    </div>

    <div v-if="errorMessage" style="color: #b91c1c">{{ errorMessage }}</div>
    <div v-if="successMessage" style="color: #064e3b">{{ successMessage }}</div>

    <form @submit="onSubmit">
      <div>
        <label for="email">Email</label>
        <input v-model="email" type="email" id="email" required />
      </div>

      <div>
        <label for="password">Password</label>
        <input v-model="password" type="password" id="password" required minlength="8" />
      </div>

      <p>
        <a href="#" @click.prevent="goBack">Back to Login</a>
      </p>

      <button type="submit" :disabled="loading">{{ loading ? 'Registering...' : 'Register' }}</button>
    </form>
  </div>
</template>
