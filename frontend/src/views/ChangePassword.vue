<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { fetchCryptoMaterial, rotatePassword } from "../function/function";
import {
  deriveKEK,
  importKEK,
  decryptMasterKey,
  encryptMasterKey,
  decryptPrivateKey,
  encryptPrivateKey,
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

const isPasswordValid = computed(() =>
  Object.values(passwordRules.value).every(Boolean),
);

const passwordsMatch = computed(
  () => newPassword.value === confirmPassword.value,
);

const onSubmit = async (e) => {
  e.preventDefault();

  errorMessage.value = "";
  successMessage.value = "";

  if (!isPasswordValid.value || !passwordsMatch.value) {
    errorMessage.value = "Invalid password format or mismatch.";
    return;
  }

  if (!currentPassword.value) {
    errorMessage.value = "Current password required.";
    return;
  }

  loading.value = true;

  try {
    console.log("Fetching crypto material...");

    const data = await fetchCryptoMaterial();

    const encryptedMKFull = Uint8Array.from(
      atob(data.encrypted_master_key),
      (c) => c.charCodeAt(0),
    );

    const encryptedPrivateKeyFull = Uint8Array.from(
      atob(data.encrypted_private_key),
      (c) => c.charCodeAt(0),
    );

    const kdfSalt = Uint8Array.from(atob(data.kdf_salt), (c) =>
      c.charCodeAt(0),
    );

    // =========================
    // OLD KEK
    // =========================

    const oldKekRaw = await deriveKEK(currentPassword.value, kdfSalt);
    const oldKek = await importKEK(oldKekRaw, "decrypt");

    // =========================
    // DECRYPT MASTER KEY
    // =========================

    const iv = encryptedMKFull.slice(0, 12);
    const encryptedData = encryptedMKFull.slice(12);

    let masterKey;

    try {
      masterKey = await decryptMasterKey(iv, oldKek, encryptedData);
    } catch {
      throw new Error("Current password is incorrect");
    }

    console.log("Master key decrypted OK");

    // =========================
    // DECRYPT PRIVATE KEY
    // =========================

    const privateKeyIv = encryptedPrivateKeyFull.slice(0, 12);
    const encryptedPrivateKey = encryptedPrivateKeyFull.slice(12);

    const privateKeyPkcs8 = await decryptPrivateKey(
      privateKeyIv,
      oldKek,
      encryptedPrivateKey,
    );

    // =========================
    // NEW KEK
    // =========================

    //watch a partir d'ici
    const newKdfSalt = crypto.getRandomValues(new Uint8Array(16));

    const newKekRaw = await deriveKEK(newPassword.value, newKdfSalt);

    const newKek = await importKEK(newKekRaw, "encrypt");

    // =========================
    // RE-ENCRYPT MASTER KEY
    // =========================
    const newIv = crypto.getRandomValues(new Uint8Array(12));

    const newEncryptedMK = await encryptMasterKey(newIv, newKek, masterKey);

    const finalEncryptedMK = new Uint8Array(
      newIv.length + newEncryptedMK.byteLength,
    );

    const newPrivateKeyIv = crypto.getRandomValues(new Uint8Array(12));

    const newEncryptedPrivateKey = await encryptPrivateKey(
      newPrivateKeyIv,
      newKek,
      privateKeyPkcs8,
    );

    const finalEncryptedPrivateKey = new Uint8Array(
      newPrivateKeyIv.length + newEncryptedPrivateKey.byteLength,
    );

    finalEncryptedPrivateKey.set(newPrivateKeyIv, 0);

    finalEncryptedPrivateKey.set(
      new Uint8Array(newEncryptedPrivateKey),
      newPrivateKeyIv.length,
    );

    finalEncryptedMK.set(newIv, 0);
    finalEncryptedMK.set(new Uint8Array(newEncryptedMK), newIv.length);

    // =========================
    // SEND TO BACKEND
    // =========================
    await rotatePassword({
      oldPassword: currentPassword.value,
      newPassword: newPassword.value,

      encMK: btoa(String.fromCharCode(...finalEncryptedMK)),
      encPrivateKey: btoa(String.fromCharCode(...finalEncryptedPrivateKey)),

      kdfSalt: btoa(String.fromCharCode(...newKdfSalt)),
    });

    successMessage.value =
      "Password successfully updated.\nYou will be redirected to the login page.";

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
      <!-- Current password -->
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

      <!-- New password -->
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

      <!-- Confirm password -->
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
