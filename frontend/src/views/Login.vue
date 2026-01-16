<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { useCryptoStore } from "../stores/crypto.store"
import { API_AUTH_URL } from "../components/constant.js"

const router = useRouter()
const cryptoStore = useCryptoStore()

const email = ref("")
const password = ref("")
const loading = ref(false)
const errorMessage = ref("")
const successMessage = ref("")

const ITERATIONS = 210_000

const onSubmit = async (e) => {
  e.preventDefault()
  errorMessage.value = ""
  successMessage.value = ""
  loading.value = true

  try {
    const res = await fetch(`${API_AUTH_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      errorMessage.value = data.message || "Login failed"
      return
    }

    successMessage.value = data.message || "Login successful"

    // =========================
    // 🔐 CRYPTO — MASTER KEY
    // =========================

    if (!data.crypto?.encrypted_master_key || !data.crypto?.kdf_salt) {
      throw new Error("Missing crypto payload from backend")
    }

    // Base64 → Uint8Array
    const encryptedMKFull = Uint8Array.from(
      atob(data.crypto.encrypted_master_key),
      c => c.charCodeAt(0)
    )

    const kdfSalt = Uint8Array.from(
      atob(data.crypto.kdf_salt),
      c => c.charCodeAt(0)
    )

    // =========================
    // PBKDF2 → KEK
    // =========================
    const pwBytes = new TextEncoder().encode(password.value)

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      pwBytes,
      "PBKDF2",
      false,
      ["deriveKey"]
    )

    const kek = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: kdfSalt,
        iterations: ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    )

    // =========================
    // AES-GCM — DECHIFFRE MK
    // FORMAT: IV (12) || CIPHERTEXT || TAG (16)
    // =========================
    const iv = encryptedMKFull.slice(0, 12)
    const ciphertext = encryptedMKFull.slice(12, encryptedMKFull.length - 16)
    const authTag = encryptedMKFull.slice(encryptedMKFull.length - 16)

    const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length)
    ciphertextWithTag.set(ciphertext, 0)
    ciphertextWithTag.set(authTag, ciphertext.length)

    const decryptedMKBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128
      },
      kek,
      ciphertextWithTag
    )

    // =========================
    // Import Master Key (AES-GCM)
    // =========================
    await cryptoStore.setMasterKey(decryptedMKBuffer)

    // 🔐 On ne garde JAMAIS le mot de passe
    password.value = ""

    router.push("/home")

  } catch (err) {
    console.error("LOGIN CRYPTO ERROR:", err)
    errorMessage.value = "Authentication or crypto error"
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2>Login</h2>

    <div v-if="errorMessage" style="color:#b91c1c">
      {{ errorMessage }}
    </div>

    <div v-if="successMessage" style="color:#065f46">
      {{ successMessage }}
    </div>

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
        {{ loading ? "Logging in..." : "Login" }}
      </button>
    </form>
  </div>
</template>
