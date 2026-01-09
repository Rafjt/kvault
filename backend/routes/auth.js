const express = require("express");
const sequelize = require("../database");
const { QueryTypes } = require("sequelize");
const router = express.Router();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const validator = require("validator");

const { sendMail } = require("../functions/mailer");
const { Limiter } = require("../functions");
const { hashPassword } = require("../functions/functions");

/* =========================================================
   Helpers
========================================================= */

function renderPage(message, isError = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Email Verification</title>
<style>
  body {
    font-family: system-ui, sans-serif;
    background: ${isError ? "#fee2e2" : "#ecfdf5"};
    color: ${isError ? "#991b1b" : "#065f46"};
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    margin: 0;
  }
  .box {
    background: white;
    padding: 2rem;
    border-radius: 1rem;
    box-shadow: 0 10px 25px rgba(0,0,0,.1);
    text-align: center;
  }
</style>
</head>
<body>
  <div class="box">
    <h2>${message}</h2>
  </div>
</body>
</html>`;
}

/* =========================================================
   Routes
========================================================= */

router.get("/about", (req, res) => {
  res.send("About the auth");
});

/* ========================= REGISTER ========================= */

router.post("/register", Limiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  try {
    const existing = await sequelize.query(
      "SELECT id FROM users WHERE login = :email",
      {
        replacements: { email },
        type: QueryTypes.SELECT
      }
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const hashedPassword = await hashPassword(password);

    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Temporary values (will be regenerated later in your flow)
    const kdfSalt = crypto.randomBytes(16);
    const masterKey = crypto.randomBytes(32);
    const ITERATIONS = 210_000;

    // KEK dérivée via KDF
    const kek = crypto.pbkdf2Sync(password, kdfSalt, ITERATIONS, 32, "sha256");

    // Chiffrement de la master key
    const iv = crypto.randomBytes(12); // nonce AES-GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);

    const encryptedMK = Buffer.concat([
      cipher.update(masterKey),
      cipher.final(),
    ]);


    await sequelize.query(
      `
      INSERT INTO users
        (login, hashed_master_password, kdf_salt, encrypted_master_key, is_verified, verification_token)
      VALUES
        (:email, :hashedPassword, :kdfSalt, :encryptedMK, false, :verificationToken)
      `,
      {
        replacements: {
          email,
          hashedPassword,
          kdfSalt,
          encryptedMK,
          verificationToken
        },
        type: QueryTypes.INSERT
      }
    );

    const verificationLink =
      `http://localhost:2111/auth/verify-email?token=${verificationToken}`;

    await sendMail(
      email,
      "Verify your email",
      `Verify your email: ${verificationLink}`,
      `<p>Click <a href="${verificationLink}">here</a> to verify your email.</p>`
    );

    return res.status(201).json({
      message: "User registered. Verification email sent."
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* ========================= LOGIN ========================= */

router.post("/login", Limiter, async (req, res) => {
  const { email, password } = req.body;
  req.log?.info({ email }, "Login attempt");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    // 1️⃣ Récupération utilisateur
    const users = await sequelize.query(
      `
      SELECT id, login, hashed_master_password, is_verified,
             encrypted_master_key, kdf_salt
      FROM users
      WHERE login = ?
      `,
      { replacements: [email], type: QueryTypes.SELECT }
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { id, hashed_master_password, is_verified, encrypted_master_key, kdf_salt } = users[0];

    if (!is_verified) {
      return res.status(403).json({ message: "Account not verified" });
    }

    // 2️⃣ Vérification mot de passe
    const isMatch = await bcrypt.compare(password, hashed_master_password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // =========================
    // Génération token opaque
    // =========================
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest();

    await sequelize.query(
      `
      INSERT INTO auth_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
      `,
      {
        replacements: [id, tokenHash],
        type: QueryTypes.INSERT
      }
    );

    // =========================
    // Cookie sécurisé (local)
    // =========================
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "Lax",   // OK en local
      secure: false,     // ⚠️ true seulement en HTTPS
      maxAge: 60 * 60 * 1000
    });

    // =========================
    // Renvoi de la C_MK + KDF info
    // =========================
    res.json({
      message: "Login successful",
      crypto: {
        encrypted_master_key: Buffer.from(encrypted_master_key).toString("base64"),
        kdf_salt: Buffer.from(kdf_salt).toString("base64"),
      }
    });

    req.log?.info({ userId: id }, "Login successful");

  } catch (error) {
    req.log?.error({ err: error }, "Login error");
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.auth_token;

    if (!token) {
      // Rien à révoquer, logout idempotent
      return res.status(204).send();
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest();

    await sequelize.query(
      `
      DELETE FROM auth_tokens
      WHERE token_hash = ?
      `,
      {
        replacements: [tokenHash],
        type: QueryTypes.DELETE
      }
    );

    // Suppression du cookie côté client
    res.clearCookie("auth_token", {
      httpOnly: true,
      sameSite: "Lax",
      secure: false // true en HTTPS
    });

    return res.status(200).json({ message: "Logged out successfully" });

  } catch (error) {
    req.log?.error({ err: error }, "Logout error");
    return res.status(500).json({ message: "Internal server error" });
  }
});
/* ========================= VERIFY EMAIL ========================= */

router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  // token must be exactly 64 hex chars
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return res
      .status(400)
      .send(renderPage("Invalid or missing verification token", true));
  }

  try {
    const [user] = await sequelize.query(
      `
      SELECT id, is_verified
      FROM users
      WHERE verification_token = :token
      `,
      {
        replacements: { token },
        type: QueryTypes.SELECT
      }
    );

    if (!user) {
      return res
        .status(400)
        .send(renderPage("Invalid or expired verification token", true));
    }

    if (user.is_verified) {
      return res.send(
        renderPage("✅ Email already verified. You can now log in.")
      );
    }

    await sequelize.query(
      `
      UPDATE users
      SET is_verified = true,
          verification_token = NULL
      WHERE id = :id
      `,
      {
        replacements: { id: user.id },
        type: QueryTypes.UPDATE
      }
    );

    return res.send(
      renderPage("✅ Email verified successfully. You can now log in.")
    );

  } catch (error) {
    console.error("VERIFY EMAIL ERROR:", error);
    return res
      .status(500)
      .send(renderPage("Internal server error", true));
  }
});

module.exports = router;
