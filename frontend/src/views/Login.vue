<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { useCryptoStore } from "../stores/crypto.store"
import { loginUser, fetchUserSalt } from "../function/function" // 💡 Ajoute fetchUserSalt dans tes requêtes API
import { 
  importKEK, 
  deriveExtendedKey, 
  splitExtendedKey, 
  decryptMasterKey, 
  importRsaKeyPair, 
  decryptPrivateKey 
} from "../function/crypto.js"

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

  let extendedKeyRaw, kekRaw, decryptedMKBuffer, decryptedPrivateKeyBuffer;

  try {
    // 1️⃣ ÉTAPE 1 : Récupérer le sel de l'utilisateur (Pre-login)
    // fetchUserSalt(email) doit faire un GET ou POST rapide vers /auth/salt?email=...
    const saltRes = await fetchUserSalt(email.value);
    if (!saltRes.kdf_salt) {
      throw new Error("Invalid credentials");
    }

    const kdfSalt = Uint8Array.from(atob(saltRes.kdf_salt), (c) => c.charCodeAt(0));

    // 2️⃣ ÉTAPE 2 : Dérivation locale 64 octets
    extendedKeyRaw = await deriveExtendedKey(password.value, kdfSalt)
    const { kekRaw: extractedKek, authMasterHash } = await splitExtendedKey(extendedKeyRaw)
    kekRaw = extractedKek

    // 3️⃣ ÉTAPE 3 : Envoi du hash réseau au serveur à la place du password brut
    const data = await loginUser(
      email.value,
      authMasterHash // 💡 Envoyé dans le paramètre password attendu par ton API
    )

    successMessage.value = data.message || "Login successful";

    if (
      !data.crypto?.encrypted_master_key ||
      !data.crypto?.rsa_public_key ||
      !data.crypto?.encrypted_rsa_private_key
    ) {
      throw new Error("Missing crypto payload from backend")
    }

    const encryptedMKFull = Uint8Array.from(atob(data.crypto.encrypted_master_key), (c) => c.charCodeAt(0));
    const rsaPublicKeyRaw = Uint8Array.from(atob(data.crypto.rsa_public_key), c => c.charCodeAt(0))
    const encryptedPrivateKeyFull = Uint8Array.from(atob(data.crypto.encrypted_rsa_private_key), c => c.charCodeAt(0))

    const kek = await importKEK(kekRaw, "decrypt")

    // 4️⃣ ÉTAPE 4 : Déchiffrement local du coffre
    const mkIv = encryptedMKFull.slice(0, 12)
    const encryptedMK = encryptedMKFull.slice(12)
    decryptedMKBuffer = await decryptMasterKey(mkIv, kek, encryptedMK)

    const privateKeyIv = encryptedPrivateKeyFull.slice(0, 12)
    const encryptedPrivateKey = encryptedPrivateKeyFull.slice(12)
    decryptedPrivateKeyBuffer = await decryptPrivateKey(privateKeyIv, kek, encryptedPrivateKey)

    const rsaKeyPair = await importRsaKeyPair(rsaPublicKeyRaw, decryptedPrivateKeyBuffer)

    // Stockage en mémoire vive (Pinia Store)
    await cryptoStore.setMasterKey(decryptedMKBuffer)
    await cryptoStore.setRSAKeys(rsaKeyPair.publicKeySpki, rsaKeyPair.privateKeyPkcs8)

    router.push("/home")

  } catch (err) {
    console.error("LOGIN CRYPTO ERROR:", err)
    errorMessage.value = "Authentication or crypto error"
  } finally {
    // 🧹 RAM Clean up
    if (extendedKeyRaw) extendedKeyRaw.fill(0)
    if (kekRaw) kekRaw.fill(0)
    if (decryptedMKBuffer) decryptedMKBuffer.fill(0)
    if (decryptedPrivateKeyBuffer) decryptedPrivateKeyBuffer.fill(0)

    password.value = ""
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