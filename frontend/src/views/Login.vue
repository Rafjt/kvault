<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { useCryptoStore } from "../stores/crypto.store"
import { loginUser } from "../function/function"
import { importKEK, deriveKEK, decryptMasterKey, importRsaKeyPair, decryptPrivateKey } from "../function/crypto.js"

const router = useRouter();
const cryptoStore = useCryptoStore();

const showCurrentPassword = ref(false);

const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const onSubmit = async (e) => {

  e.preventDefault()

  errorMessage.value = ""
  successMessage.value = ""
  loading.value = true

  try {

    const data = await loginUser(
      email.value,
      password.value
    )

    successMessage.value = data.message || "Login successful";

    // =========================
    // 🔐 CRYPTO — KEY MANAGEMENT
    // =========================


    if (
      !data.crypto?.encrypted_master_key ||
      !data.crypto?.kdf_salt ||
      !data.crypto?.rsa_public_key ||
      !data.crypto?.encrypted_rsa_private_key
    ) {
      throw new Error("Missing crypto payload from backend")
    }

    const encryptedMKFull = Uint8Array.from(
      atob(data.crypto.encrypted_master_key),
      (c) => c.charCodeAt(0),
    );

    const kdfSalt = Uint8Array.from(atob(data.crypto.kdf_salt), (c) =>
      c.charCodeAt(0),
    );

    const rsaPublicKeyRaw = Uint8Array.from(
      atob(data.crypto.rsa_public_key),
      c => c.charCodeAt(0)
    )

    const encryptedPrivateKeyFull = Uint8Array.from(
      atob(data.crypto.encrypted_rsa_private_key),
      c => c.charCodeAt(0)
    )

    // =========================
    // ARGON2 → KEK
    // =========================

    const kekRaw = await deriveKEK(password.value,kdfSalt)

    const kek = await importKEK(kekRaw,"decrypt")

    // =========================
    // AES-GCM — DECHIFFRE MK
    // =========================

    const mkIv = encryptedMKFull.slice(0, 12)
    const encryptedMK = encryptedMKFull.slice(12)
    const decryptedMKBuffer = await decryptMasterKey(mkIv, kek, encryptedMK)

    // =========================
    // AES-GCM — DECHIFFRE PK
    // =========================

    const privateKeyIv = encryptedPrivateKeyFull.slice(0, 12)
    const encryptedPrivateKey = encryptedPrivateKeyFull.slice(12)

    const decryptedPrivateKeyBuffer = await decryptPrivateKey(privateKeyIv, kek, encryptedPrivateKey)

    // =========================
    // IMPORT BI-CLÉ RSA
    // =========================

    const rsaKeyPair = await importRsaKeyPair(rsaPublicKeyRaw, decryptedPrivateKeyBuffer)

    const pubKey = rsaKeyPair.publicKeySpki
    const privKey = rsaKeyPair.privateKeyPkcs8

    // =========================
    // IMPORT MASTER KEY
    // =========================

    await cryptoStore.setMasterKey(decryptedMKBuffer)

    // =========================
    // IMPORT RSA KEYPAIR
    // =========================

    await cryptoStore.setRSAKeys(pubKey, privKey)

    // =========================
    // CLEANUP
    // =========================

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

    <div v-if="errorMessage" style="color: #b91c1c">
      {{ errorMessage }}
    </div>

    <div v-if="successMessage" style="color: #065f46">
      {{ successMessage }}
    </div>

    <form @submit="onSubmit">

      <div class="form-field">
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>

      <div class="form-field">
        <label>Password</label>

        <div class="input-wrapper">
          <input
            v-model="password"
            :type="showCurrentPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
          />

          <input
            type="checkbox"
            v-model="showCurrentPassword"
            class="toggle"
          />
        </div>
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