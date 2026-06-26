<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { API_AUTH_URL } from "../components/constant.js";
import { argon2id } from 'hash-wasm'

const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const showPassword = ref(false)
const showConfirmPassword = ref(false)

const errorMessage = ref('')
const successMessage = ref('')
const loading = ref(false)

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  return btoa(String.fromCharCode(...bytes))
}

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

  if (!isPasswordValid.value || !passwordsMatch.value) {
    errorMessage.value = 'Form validation failed'
    return
  }

  loading.value = true

  try {
    // 1. Génération du matos crypto
    const masterKey = crypto.getRandomValues(new Uint8Array(32))
    const kdfSalt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const privateKeyIv = crypto.getRandomValues(new Uint8Array(12))

    // 2. Dérivation de la KEK
    const kekRaw = await argon2id({
      password: password.value,
      salt: kdfSalt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: 'binary'
    })

    const kek = await crypto.subtle.importKey(
      "raw", kekRaw, { name: "AES-GCM" }, false, ["encrypt"]
    )

    // 3. Chiffrement de la Master Key
    const encryptedMK = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, kek, masterKey
    )

    // 4. Assemblage : IV + CIPHERTEXT
    const encryptedMasterKey = new Uint8Array(iv.length + encryptedMK.byteLength)
    encryptedMasterKey.set(iv, 0)
    encryptedMasterKey.set(new Uint8Array(encryptedMK), iv.length)

    // 5. Génération de la bi-clé RSA
    const rsaKeyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt"]
    )

    // 6. Exports des clées
    const publicKeySpki = await crypto.subtle.exportKey(
      "spki",
      rsaKeyPair.publicKey
    )

    const privateKeyPkcs8 = await crypto.subtle.exportKey(
      "pkcs8",
      rsaKeyPair.privateKey
    )

    // 7. Chiffrement de la clé privée 
    const encryptedPrivateKey = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: privateKeyIv
      },
      kek,
      privateKeyPkcs8
    )

    // 8. Concaténation IV + Ciphertext (partie privé)
    const encryptedPrivateKeyBlob = new Uint8Array(
      privateKeyIv.length + encryptedPrivateKey.byteLength
    )

    encryptedPrivateKeyBlob.set(privateKeyIv, 0)

    encryptedPrivateKeyBlob.set(
      new Uint8Array(encryptedPrivateKey),
      privateKeyIv.length
    )

    // . Envoi au serveur (L'encodage est délégué proprement ici sans polluer les variables)
    const res = await fetch(`${API_AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        encMK: arrayBufferToBase64(encryptedMasterKey),
        kdfSalt: arrayBufferToBase64(kdfSalt),
        
        rsaPublicKey: arrayBufferToBase64(publicKeySpki),
        encPrivateKey: arrayBufferToBase64(encryptedPrivateKeyBlob)

      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || 'Registration failed'
    } else {
      successMessage.value = data.message || 'Registration successful.'
      setTimeout(() => { router.push('/login') }, 5000)
    }
  } catch (err) {
    errorMessage.value = 'An error occurred during registration'
    console.error(err)
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

    <form class="register-form" @submit="onSubmit">

      <!-- EMAIL -->
      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>

      <!-- PASSWORD -->
      <div class="field">
        <label>Password</label>

        <div class="input-wrapper">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
          />
          <input type="checkbox" v-model="showPassword" class="toggle" />
        </div>

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
      <div class="field">
        <label>Confirm password</label>

        <div class="input-wrapper">
          <input
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            required
          />
          <input type="checkbox" v-model="showConfirmPassword" class="toggle" />
        </div>

        <div
          v-if="confirmPassword"
          :style="{
            marginTop: '0.5rem',
            color: passwordsMatch ? '#16a34a' : '#b91c1c'
          }"
        >
          {{ passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match" }}
        </div>
      </div>

      <p>
        <router-link to="/login">
          Back to login
        </router-link>
      </p>
      <button :disabled="loading || !isPasswordValid || !passwordsMatch">
        {{ loading ? "Registering..." : "Register" }}
      </button>

    </form>
  </div>
<style scoped>
.register-form .field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}
</style>
</template>