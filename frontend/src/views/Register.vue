<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { registerUser } from "../function/function"
import { 
  deriveExtendedKey, 
  splitExtendedKey, 
  importKEK, 
  encryptMasterKey, 
  generateRSAKeyPair, 
  exportRsaKeyPair, 
  encryptPrivateKey,
  arrayBufferToBase64 
} from '../function/crypto.js';

const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const showPassword = ref(false)
const showConfirmPassword = ref(false)

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

const isPasswordValid = computed(() => Object.values(passwordRules.value).every(Boolean))
const passwordsMatch = computed(() => password.value === confirmPassword.value)

const onSubmit = async (e) => {
  e.preventDefault()
  errorMessage.value = ''
  successMessage.value = ''

  if (!isPasswordValid.value || !passwordsMatch.value) {
    errorMessage.value = 'Form validation failed'
    return
  }

  loading.value = true

  // Déclaration des structures hors du try pour pouvoir les écraser en RAM dans le finally
  let masterKey, extendedKeyRaw, kekRaw;

  try {
    // ===================================
    // Génération du matériel cryptographique
    // ===================================
    masterKey = crypto.getRandomValues(new Uint8Array(32))
    const kdfSalt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const privateKeyIv = crypto.getRandomValues(new Uint8Array(12))
    
    // =======================================
    // Dérivation étendue (KEK + Auth Hash)
    // =======================================
    extendedKeyRaw = await deriveExtendedKey(password.value, kdfSalt)
    const { kekRaw: extractedKek, authMasterHash } = await splitExtendedKey(extendedKeyRaw)
    kekRaw = extractedKek

    const kek = await importKEK(kekRaw, "encrypt")

    // ============================
    // Chiffrement de la Master Key
    // ============================
    const encryptedMK = await encryptMasterKey(iv, kek, masterKey)
    const encryptedMasterKey = new Uint8Array(iv.length + encryptedMK.byteLength)
    encryptedMasterKey.set(iv, 0)
    encryptedMasterKey.set(new Uint8Array(encryptedMK), iv.length)

    // =====================
    // Génération bi-clé RSA
    // =====================
    const rsaKeyPair = await generateRSAKeyPair()
    const { publicKeySpki, privateKeyPkcs8 } = await exportRsaKeyPair(rsaKeyPair)

    // ============================    
    // Chiffrement de la clé privée 
    // ============================
    const encryptedPrivateKey = await encryptPrivateKey(privateKeyIv, kek, privateKeyPkcs8)
    const encryptedPrivateKeyBlob = new Uint8Array(privateKeyIv.length + encryptedPrivateKey.byteLength)
    encryptedPrivateKeyBlob.set(privateKeyIv, 0)
    encryptedPrivateKeyBlob.set(new Uint8Array(encryptedPrivateKey), privateKeyIv.length)

    // ======================================
    // Envoi des données (Sans password brut !)
    // ======================================
    const data = await registerUser({
      email: email.value,
      password: authMasterHash, // 💡 Le serveur reçoit ça à la place du mot de passe
      encMK: arrayBufferToBase64(encryptedMasterKey),
      kdfSalt: arrayBufferToBase64(kdfSalt),
      rsaPublicKey: arrayBufferToBase64(publicKeySpki),
      encPrivateKey: arrayBufferToBase64(encryptedPrivateKeyBlob)
    })

    successMessage.value = data.message || "Registration successful."

    setTimeout(() => {
      router.push('/login')
    }, 5000)

  } catch (err) {
    errorMessage.value = 'An error occurred during registration'
    console.error(err)
  } finally {
    // 🔥 Zéro-Knowledge RAM Cleanup (Hygiène mémoire stricte)
    if (masterKey) masterKey.fill(0)
    if (extendedKeyRaw) extendedKeyRaw.fill(0)
    if (kekRaw) kekRaw.fill(0)

    password.value = ''
    confirmPassword.value = ''
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2>Register</h2>
    <div v-if="errorMessage" style="color:#b91c1c">{{ errorMessage }}</div>
    <div v-if="successMessage" style="color:#064e3b">{{ successMessage }}</div>

    <form class="register-form" @submit="onSubmit">
      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>

      <div class="field">
        <label>Password</label>
        <div class="input-wrapper">
          <input v-model="password" :type="showPassword ? 'text' : 'password'" required />
          <input type="checkbox" v-model="showPassword" class="toggle" />
        </div>

        <div style="margin-top: 0.5rem; font-size: 0.9rem">
          <div :style="{ color: passwordRules.minLength ? '#16a34a' : '#b91c1c' }">✓ Minimum 12 characters</div>
          <div :style="{ color: passwordRules.uppercase ? '#16a34a' : '#b91c1c' }">✓ One uppercase letter</div>
          <div :style="{ color: passwordRules.lowercase ? '#16a34a' : '#b91c1c' }">✓ One lowercase letter</div>
          <div :style="{ color: passwordRules.number ? '#16a34a' : '#b91c1c' }">✓ One number</div>
          <div :style="{ color: passwordRules.special ? '#16a34a' : '#b91c1c' }">✓ One special character</div>
        </div>
      </div>

      <div class="field">
        <label>Confirm password</label>
        <div class="input-wrapper">
          <input v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" required />
          <input type="checkbox" v-model="showConfirmPassword" class="toggle" />
        </div>
        <div v-if="confirmPassword" :style="{ marginTop: '0.5rem', color: passwordsMatch ? '#16a34a' : '#b91c1c' }">
          {{ passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match" }}
        </div>
      </div>

      <p><router-link to="/login">Back to login</router-link></p>
      <button :disabled="loading || !isPasswordValid || !passwordsMatch">
        {{ loading ? "Registering..." : "Register" }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.register-form .field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}
</style>