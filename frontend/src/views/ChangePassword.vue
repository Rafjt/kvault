<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { API_AUTH_URL } from "../components/constant.js";
import { argon2id } from "hash-wasm";

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

    const res = await fetch(`${API_AUTH_URL}/crypto`, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Crypto fetch failed (${res.status})`);
    }

    const data = await res.json();

    if (!data?.encrypted_master_key || !data?.kdf_salt) {
      throw new Error("Invalid crypto payload from backend");
    }

    const encryptedMKFull = Uint8Array.from(
      atob(data.encrypted_master_key),
      (c) => c.charCodeAt(0),
    );

    const kdfSalt = Uint8Array.from(atob(data.kdf_salt), (c) =>
      c.charCodeAt(0),
    );

    // =========================
    // OLD KEK
    // =========================
    const oldKekRaw = await argon2id({
      password: currentPassword.value,
      salt: kdfSalt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: "binary",
    });

    const oldKek = await crypto.subtle.importKey(
      "raw",
      oldKekRaw,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    // =========================
    // DECRYPT MASTER KEY
    // =========================
    const iv = encryptedMKFull.slice(0, 12);
    const encryptedData = encryptedMKFull.slice(12);

    let masterKeyBuffer;

    try {
      masterKeyBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        oldKek,
        encryptedData,
      );
    } catch (err) {
      throw new Error("Current password is incorrect");
    }

    const masterKey = new Uint8Array(masterKeyBuffer);

    console.log("Master key decrypted OK");

    // =========================
    // NEW KEK
    // =========================
    const newKdfSalt = crypto.getRandomValues(new Uint8Array(16));

    const newKekRaw = await argon2id({
      password: newPassword.value,
      salt: newKdfSalt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: "binary",
    });

    const newKek = await crypto.subtle.importKey(
      "raw",
      newKekRaw,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    // =========================
    // RE-ENCRYPT MASTER KEY
    // =========================
    const newIv = crypto.getRandomValues(new Uint8Array(12));

    const newEncryptedMK = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newIv },
      newKek,
      masterKey,
    );

    const finalEncryptedMK = new Uint8Array(
      newIv.length + newEncryptedMK.byteLength,
    );

    finalEncryptedMK.set(newIv, 0);
    finalEncryptedMK.set(new Uint8Array(newEncryptedMK), newIv.length);

    // =========================
    // SEND TO BACKEND
    // =========================
    const updateRes = await fetch(`${API_AUTH_URL}/crypto/rotate-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        oldPassword: currentPassword.value,
        newPassword: newPassword.value,
        encMK: btoa(String.fromCharCode(...finalEncryptedMK)),
        kdfSalt: btoa(String.fromCharCode(...newKdfSalt)),
      }),
    });

    if (!updateRes.ok) {
      const errData = await updateRes.json().catch(() => ({}));
      throw new Error(errData.message || "Password rotation failed");
    }

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
