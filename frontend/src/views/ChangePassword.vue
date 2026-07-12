<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { fetchCryptoMaterial, rotatePassword } from "../function/function";
import {
  deriveExtendedKey,
  splitExtendedKey,
  importKEK,
  decryptMasterKey,
  encryptMasterKey,
  decryptPrivateKey,
  encryptPrivateKey,
  arrayBufferToBase64, // 💡 Récupère l'utilitaire mis à jour
} from "../function/crypto";

const router = useRouter();

const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");

const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);

const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

// Password policy
const passwordRules = computed(() => ({
  minLength: newPassword.value.length >= 12,
  uppercase: /[A-Z]/.test(newPassword.value),
  lowercase: /[a-z]/.test(newPassword.value),
  number: /\d/.test(newPassword.value),
  special: /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/]/.test(newPassword.value),
}));

const isPasswordValid = computed(() => Object.values(passwordRules.value).every(Boolean));
const passwordsMatch = computed(() => newPassword.value === confirmPassword.value);

const onSubmit = async (e) => {
  e.preventDefault();
  errorMessage.value = "";
  successMessage.value = "";

  if (!isPasswordValid.value || !passwordsMatch.value || !currentPassword.value) {
    errorMessage.value = "Form validation failed.";
    return;
  }

  loading.value = true;

  // Variables déclarées en dehors pour le nettoyage RAM global dans le 'finally'
  let oldExtendedKeyRaw, newExtendedKeyRaw, oldKekRaw, newKekRaw, masterKey, privateKeyPkcs8;

  try {
    const data = await fetchCryptoMaterial();

    const encryptedMKFull = Uint8Array.from(atob(data.encrypted_master_key), (c) => c.charCodeAt(0));
    const encryptedPrivateKeyFull = Uint8Array.from(atob(data.encrypted_private_key), (c) => c.charCodeAt(0));
    const kdfSalt = Uint8Array.from(atob(data.kdf_salt), (c) => c.charCodeAt(0));

    // ===================================
    // 1️⃣ OLD KEY DERIVATION & AUTH HASH
    // ===================================
    oldExtendedKeyRaw = await deriveExtendedKey(currentPassword.value, kdfSalt);
    const { kekRaw: extractedOldKek, authMasterHash: oldAuthMasterHash } = await splitExtendedKey(oldExtendedKeyRaw);
    oldKekRaw = extractedOldKek;

    const oldKek = await importKEK(oldKekRaw, "decrypt");

    // =========================
    // 2️⃣ DECRYPT SECRETS
    // =========================
    const iv = encryptedMKFull.slice(0, 12);
    const encryptedData = encryptedMKFull.slice(12);

    try {
      masterKey = await decryptMasterKey(iv, oldKek, encryptedData);
    } catch {
      throw new Error("Current password is incorrect");
    }

    const privateKeyIv = encryptedPrivateKeyFull.slice(0, 12);
    const encryptedPrivateKey = encryptedPrivateKeyFull.slice(12);

    privateKeyPkcs8 = await decryptPrivateKey(privateKeyIv, oldKek, encryptedPrivateKey);

    // ===================================
    // 3️⃣ NEW KEY DERIVATION & AUTH HASH
    // ===================================
    const newKdfSalt = crypto.getRandomValues(new Uint8Array(16));
    newExtendedKeyRaw = await deriveExtendedKey(newPassword.value, newKdfSalt);
    const { kekRaw: extractedNewKek, authMasterHash: newAuthMasterHash } = await splitExtendedKey(newExtendedKeyRaw);
    newKekRaw = extractedNewKek;

    const newKek = await importKEK(newKekRaw, "encrypt");

    // =========================
    // 4️⃣ RE-ENCRYPT SECRETS
    // =========================
    const newIv = crypto.getRandomValues(new Uint8Array(12));
    const newEncryptedMK = await encryptMasterKey(newIv, newKek, masterKey);
    const finalEncryptedMK = new Uint8Array(newIv.length + newEncryptedMK.byteLength);
    finalEncryptedMK.set(newIv, 0);
    finalEncryptedMK.set(new Uint8Array(newEncryptedMK), newIv.length);

    const newPrivateKeyIv = crypto.getRandomValues(new Uint8Array(12));
    const newEncryptedPrivateKey = await encryptPrivateKey(newPrivateKeyIv, newKek, privateKeyPkcs8);
    const finalEncryptedPrivateKey = new Uint8Array(newPrivateKeyIv.length + newEncryptedPrivateKey.byteLength);
    finalEncryptedPrivateKey.set(newPrivateKeyIv, 0);
    finalEncryptedPrivateKey.set(new Uint8Array(newEncryptedPrivateKey), newPrivateKeyIv.length);

    // =========================
    // 5️⃣ NETWORK TRANSMISSION
    // =========================
    await rotatePassword({
      oldPassword: oldAuthMasterHash, // 💡 Renvoie le hash de l'ancien mot de passe
      newPassword: newAuthMasterHash, // 💡 Renvoie le hash du nouveau mot de passe
      encMK: arrayBufferToBase64(finalEncryptedMK),
      encPrivateKey: arrayBufferToBase64(finalEncryptedPrivateKey),
      kdfSalt: arrayBufferToBase64(newKdfSalt),
    });

    successMessage.value = "Password successfully updated.\nYou will be redirected to the login page.";

    // 🔒 N'efface les champs du formulaire que si la transaction réseau a réussi à 100%
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";

    setTimeout(() => {
      router.push("/login");
    }, 7000);

  } catch (err) {
    console.error("ROTATION ERROR:", err);
    errorMessage.value = err.message || "Unexpected error during rotation";
  } finally {
    // 🧼 Nettoyage immédiat des secrets binaires en RAM
    if (oldExtendedKeyRaw) oldExtendedKeyRaw.fill(0);
    if (newExtendedKeyRaw) newExtendedKeyRaw.fill(0);
    if (oldKekRaw) oldKekRaw.fill(0);
    if (newKekRaw) newKekRaw.fill(0);
    if (masterKey) masterKey.fill(0);
    if (privateKeyPkcs8) privateKeyPkcs8.fill(0);

    loading.value = false;
  }
};
</script>

<template>
  <div class="change-password-page">
    <h2>Change password</h2>

    <div v-if="errorMessage" style="color: #b91c1c">
      {{ errorMessage }}
    </div>

    <div v-if="successMessage" style="color: #065f46; white-space: pre-line">
      {{ successMessage }}
    </div>

    <form @submit="onSubmit">
      <div class="field">
        <label>Current password</label>

        <div class="input-wrapper">
          <input
            v-model="currentPassword"
            :type="showCurrentPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
          />

          <input type="checkbox" v-model="showCurrentPassword" class="toggle" />
        </div>
      </div>

      <br />

      <div class="field">
        <label>New password</label>

        <div class="input-wrapper">
          <input
            v-model="newPassword"
            :type="showNewPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
          />

          <input type="checkbox" v-model="showNewPassword" class="toggle" />
        </div>

        <div style="margin-top: 0.5rem; font-size: 0.9rem">
          <div
            :style="{ color: passwordRules.minLength ? '#16a34a' : '#b91c1c' }"
          >
            ✓ Minimum 12 characters
          </div>

          <div
            :style="{ color: passwordRules.uppercase ? '#16a34a' : '#b91c1c' }"
          >
            ✓ One uppercase letter
          </div>

          <div
            :style="{ color: passwordRules.lowercase ? '#16a34a' : '#b91c1c' }"
          >
            ✓ One lowercase letter
          </div>

          <div :style="{ color: passwordRules.number ? '#16a34a' : '#b91c1c' }">
            ✓ One number
          </div>

          <div
            :style="{ color: passwordRules.special ? '#16a34a' : '#b91c1c' }"
          >
            ✓ One special character
          </div>
        </div>
      </div>

      <br />

      <div class="field">
        <label>Confirm new password</label>

        <div class="input-wrapper">
          <input
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
          />

          <input type="checkbox" v-model="showConfirmPassword" class="toggle" />
        </div>

        <div
          v-if="confirmPassword"
          :style="{
            marginTop: '0.5rem',
            color: passwordsMatch ? '#16a34a' : '#b91c1c',
          }"
        >
          {{
            passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"
          }}
        </div>
      </div>

      <br />

      <button :disabled="loading || !isPasswordValid || !passwordsMatch">
        {{ loading ? "Changing..." : "Change password" }}
      </button>
    </form>

    <br />

    <button @click="router.back()">Cancel</button>
  </div>
  <style scoped>
    .change-password-page .field {
      margin-bottom: 0;
    }
  </style>
</template>
