<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { API_AUTH_URL } from "../components/constant.js";

const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const errorMessage = ref('')
const successMessage = ref('')
const loading = ref(false)

const passwordRules = computed(() => ({
  minLength: password.value.length >= 12,
  uppercase: /[A-Z]/.test(password.value),
  lowercase: /[a-z]/.test(password.value),
  number: /\d/.test(password.value),
  special: /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/]/.test(password.value)
}))

const isPasswordValid = computed(() =>
  Object.values(passwordRules.value).every(Boolean)
)

const passwordsMatch = computed(() =>
  password.value === confirmPassword.value
)

const onSubmit = async (e) => {
  e.preventDefault()

  errorMessage.value = ''
  successMessage.value = ''

  // Password policy
  if (!isPasswordValid.value) {
    errorMessage.value =
      'Password policy not respected'
    return
  }

  // Confirmation check
  if (!passwordsMatch.value) {
    errorMessage.value =
      'Passwords do not match'
    return
  }

  loading.value = true

  try {
    const res = await fetch(`${API_AUTH_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value =
        data.message ||
        data.error ||
        data.errors ||
        'Registration failed'
    } else {
      successMessage.value =
        data.message ||
        'Registration successful. Check your email.'

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

    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>

    <div v-if="successMessage" style="color:#064e3b">
      {{ successMessage }}
    </div>

    <form @submit="onSubmit">

      <!-- EMAIL -->
      <div>
        <label>Email</label>
        <input
          v-model="email"
          type="email"
          required
        />
      </div>

      <!-- PASSWORD -->
      <div>
        <label>Password</label>
        <input
          v-model="password"
          type="password"
          required
        />

        <!-- PASSWORD RULES -->
        <div style="margin-top: 0.5rem; font-size: 0.9rem">

          <div :style="{ color: passwordRules.minLength ? '#16a34a' : '#b91c1c' }">
            ✓ Minimum 12 characters
          </div>

          <div :style="{ color: passwordRules.uppercase ? '#16a34a' : '#b91c1c' }">
            ✓ One uppercase letter
          </div>

          <div :style="{ color: passwordRules.lowercase ? '#16a34a' : '#b91c1c' }">
            ✓ One lowercase letter
          </div>

          <div :style="{ color: passwordRules.number ? '#16a34a' : '#b91c1c' }">
            ✓ One number
          </div>

          <div :style="{ color: passwordRules.special ? '#16a34a' : '#b91c1c' }">
            ✓ One special character
          </div>

        </div>
      </div>

      <!-- CONFIRM PASSWORD -->
      <div>
        <label>Confirm password</label>

        <input
          v-model="confirmPassword"
          type="password"
          required
        />

        <div
          v-if="confirmPassword"
          :style="{
            marginTop: '0.5rem',
            color: passwordsMatch ? '#16a34a' : '#b91c1c'
          }"
        >
          {{
            passwordsMatch
              ? '✓ Passwords match'
              : '✗ Passwords do not match'
          }}
        </div>
      </div>

      <p>
        <router-link to="/login">
          Back to login
        </router-link>
      </p>

      <button
        :disabled="
          loading ||
          !isPasswordValid ||
          !passwordsMatch
        "
      >
        {{
          loading
            ? 'Registering...'
            : 'Register'
        }}
      </button>

    </form>
  </div>
</template>