<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";

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

const onSubmit = async (e) => {
  e.preventDefault();

  errorMessage.value = "";
  successMessage.value = "";

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = "The two new passwords do not match.";
    return;
  }

  loading.value = true;

  try {
    // TODO:
    // - Derive old KEK
    // - Decrypt master key
    // - Derive new KEK
    // - Encrypt master key
    // - Send update to backend

    successMessage.value = "Not implemented yet.";
  } catch (err) {
    errorMessage.value = "Unable to change password.";
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

    <div v-if="successMessage" style="color: #065f46">
      {{ successMessage }}
    </div>

    <form @submit="onSubmit">
      <div class="field">
        <label>Current password</label>

        <div class="input-wrapper">
          <input
            v-model="currentPassword"
            :type="showCurrentPassword ? 'text' : 'password'"
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
            required
          />

          <input type="checkbox" v-model="showNewPassword" class="toggle" />
        </div>
      </div>

      <br />

      <div class="field">
        <label>Confirm new password</label>

        <div class="input-wrapper">
          <input
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            required
          />

          <input type="checkbox" v-model="showConfirmPassword" class="toggle" />
        </div>
      </div>

      <br />

      <button :disabled="loading">
        {{ loading ? "Changing..." : "Change password" }}
      </button>
    </form>

    <br />

    <button @click="router.back()">Cancel</button>
  </div>
</template>
