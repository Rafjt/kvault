<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useCryptoStore } from "../stores/crypto.store";
import { API_AUTH_URL } from "../components/constant.js";
import { argon2id } from "hash-wasm";

const router = useRouter();
const cryptoStore = useCryptoStore();

const showCurrentPassword = ref(false);

const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const onSubmit = async (e) => {
  e.preventDefault();
  errorMessage.value = "";
  successMessage.value = "";
  loading.value = true;

  try {
    const res = await fetch(`${API_AUTH_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      errorMessage.value = data.message || "Login failed";
      return;
    }

    successMessage.value = data.message || "Login successful";

    // =========================
    // 🔐 CRYPTO — MASTER KEY
    // =========================

    if (!data.crypto?.encrypted_master_key || !data.crypto?.kdf_salt) {
      throw new Error("Missing crypto payload from backend");
    }

    // Base64 → Uint8Array
    const encryptedMKFull = Uint8Array.from(
      atob(data.crypto.encrypted_master_key),
      (c) => c.charCodeAt(0),
    );

    const kdfSalt = Uint8Array.from(atob(data.crypto.kdf_salt), (c) =>
      c.charCodeAt(0),
    );

    // =========================
    // ARGON2 → KEK
    // =========================

    const kekRaw = await argon2id({
      password: password.value,
      salt: kdfSalt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: "binary",
    });

    const kek = await crypto.subtle.importKey(
      "raw",
      kekRaw,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    console.log(kek);

    // =========================
    // AES-GCM — DECHIFFRE MK
    // =========================
    // 1. Les 12 premiers octets pour l'IV
    const iv = encryptedMKFull.slice(0, 12);

    // 2. TOUT le reste (le ciphertext ET le tag d'authentification combinés)
    const encryptedDataWithoutIv = encryptedMKFull.slice(12);

    const decryptedMKBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128, // Optionnel (128 bits / 16 octets est la valeur par défaut)
      },
      kek,
      encryptedDataWithoutIv, // On passe le bloc complet
    );

    // =========================
    // Import Master Key (AES-GCM)
    // =========================
    await cryptoStore.setMasterKey(decryptedMKBuffer);

    // 🔐 On ne garde JAMAIS le mot de passe
    password.value = "";

    router.push("/home");
  } catch (err) {
    console.error("LOGIN CRYPTO ERROR:", err);
    errorMessage.value = "Authentication or crypto error";
  } finally {
    loading.value = false;
  }
};
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
      <div>
        <label>Email</label>
        <input v-model="email" type="email" required />
      </div>

      <div>
        <label>Password</label>
        <div class="input-wrapper">
          <input
            v-model="password"
            :type="password ? 'text' : 'password'"
            required
          />

          <input type="checkbox" v-model="showCurrentPassword" class="toggle" />
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
