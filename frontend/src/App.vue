<script setup>
</script>

<template>
<div>
  
  <div>
    <h1>Welcome To KVAULT</h1>
  </div>
  <h2>Login</h2>

  <div>errorMessage</div>
  <div>successMessage</div>

  <form>
    <div>
      <label for="email">Email</label>
      <input type="email" id="email" required />
    </div>

    <div>
      <label for="password">Password</label>
      <input type="password" id="password" required />
    </div>

    <div>
      <label for="twoFactorCode">2FA Code</label>
      <input type="text" id="twoFactorCode" required />
    </div>

    <p>
      <a href="#">Forgot my password</a>
    </p>

    <button type="submit">Login</button>
  </form>
</div>
</template>
