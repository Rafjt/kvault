const express = require("express");
const sequelize = require("../database");
const { QueryTypes } = require("sequelize");
const router = express.Router();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const validator = require("validator");

const { Limiter } = require("../functions");
const { hashPassword } = require("../functions/functions");
const { sendTokenMail } = require("../functions/mailer");
const { authMiddleware } = require("../middleware/auth.middleware.js");
const argon2 = require("argon2");


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

router.get('/me', authMiddleware, (req, res) => {
  res.json({
    id: req.user.id,
  })
})


/* ========================= REGISTER ========================= */

router.post("/register", Limiter, async (req, res) => {
  const { email, password, encMK, kdfSalt,rsaPublicKey,encPrivateKey } = req.body;
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/]).{12,}$/

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message:
        "Password must contain at least 12 characters, uppercase, lowercase, number and special character"
    })
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  if (!rsaPublicKey || !encPrivateKey) {
    return res.status(400).json({ error: "RSA Key-Pair required." });
  }

  try {
    const existing = await sequelize.query(
      "SELECT id, is_verified, token_expiry FROM users WHERE login = :email",
      {
        replacements: { email },
        type: QueryTypes.SELECT,
      }
    );

    if (existing.length > 0) {
      const user = existing[0];

      // Case 2: already verified → hard block
      if (Boolean(user.is_verified)) {
        return res.status(409).json({ error: "Email already registered." });
      }

      // Case 4: not verified but token still valid → block
      if (user.token_expiry && user.token_expiry > new Date()) {
        return res.status(409).json({
          error: "Account not verified yet. Please check your email.",
        });
      }

      // NOT verified AND expired → delete
      if (user.token_expiry && user.token_expiry < new Date()) {
        await sequelize.query("DELETE FROM users WHERE login = :email", {
          replacements: { email },
          type: QueryTypes.DELETE,
        });
      }
    }

    // =========================
    // Hash mot de passe (auth)
    // =========================
    const hashedPassword = await hashPassword(password);

    // =========================
    // Crypto setup
    // =========================
    const verificationToken = crypto.randomBytes(32).toString("hex");
    // const kdfSalt = crypto.randomBytes(16);
    // const ITERATIONS = 210_000;

    // // Master Key aléatoire (indépendante du mot de passe)
    // const masterKey = crypto.randomBytes(32);

    // const kek = await argon2.hash(password, {
    //   type: argon2.argon2id,

    //   salt: kdfSalt,

    //   memoryCost: 65536, // 64 MB
    //   timeCost: 3,
    //   parallelism: 1,

    //   hashLength: 32,

    //   raw: true
    // });

    // // =========================
    // // Chiffrement Master Key (AES-GCM)
    // // =========================
    // const iv = crypto.randomBytes(12); // nonce GCM
    // const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);

    // const ciphertext = Buffer.concat([
    //   cipher.update(masterKey),
    //   cipher.final()
    // ]);

    // const authTag = cipher.getAuthTag();

    // // FORMAT CANONIQUE : IV || CIPHERTEXT || TAG
    // const encryptedMasterKey = Buffer.concat([
    //   iv,
    //   ciphertext,
    //   authTag
    // ]);

    // =========================
    // Insert DB
    // =========================
    await sequelize.query(
      `
      INSERT INTO users
        (login, hashed_master_password, kdf_salt, encrypted_master_key, verification_token, rsa_public_key, encrypted_rsa_private_key, is_verified, token_expiry)
      VALUES
        (:email, :hashedPassword, :kdfSalt, :encMK, :verificationToken, :rsaPublicKey, :encPrivateKey, false, DATE_ADD(NOW(), INTERVAL 30 MINUTE))
      `,
      {
        replacements: {
          email,
          hashedPassword,
          kdfSalt: Buffer.from(kdfSalt, 'base64'),
          encMK: Buffer.from(encMK, 'base64'),

          rsaPublicKey: Buffer.from(rsaPublicKey, "base64"),
          encPrivateKey: Buffer.from(encPrivateKey, "base64"),

          verificationToken,
        },
        type: QueryTypes.INSERT,
      }
    );

    await sendTokenMail(verificationToken, email);

    return res.status(201).json({
      message:
        "User registered. Verification email sent. Will expire in 30 minutes",
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
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  try {
    // 1️⃣ Fetch user
    const users = await sequelize.query(
  `
      SELECT
          id,
          login,
          hashed_master_password,
          is_verified,
          encrypted_master_key,
          kdf_salt,
          rsa_public_key,
          encrypted_rsa_private_key,
          token_expiry
      FROM users
      WHERE login = ?
      `,
      {
        replacements: [email],
        type: QueryTypes.SELECT,
      }
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const user = users[0];

    // 2️⃣ Check password FIRST
    const isMatch = await bcrypt.compare(password, user.hashed_master_password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // 3️⃣ Email not verified
    if (!user.is_verified) {
      // Token expired → regenerate & resend
      if (user.token_expiry && user.token_expiry < new Date()) {
        const newToken = crypto.randomBytes(32).toString("hex");

        await sequelize.query(
          `
          UPDATE users
          SET verification_token = :token,
              token_expiry = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
          WHERE id = :id
          `,
          {
            replacements: {
              token: newToken,
              id: user.id,
            },
            type: QueryTypes.UPDATE,
          }
        );

        await sendTokenMail(newToken, email);

        return res.status(403).json({
          message: "Verification link expired. A new email has been sent.",
        });
      }

      return res.status(403).json({
        message: "Please verify your email before logging in.",
      });
    }

    // =========================
    // 4️⃣ Generate auth token
    // =========================
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest();

    await sequelize.query(
      `
      INSERT INTO auth_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
      `,
      {
        replacements: [user.id, tokenHash],
        type: QueryTypes.INSERT,
      }
    );

    // =========================
    // 5️⃣ Secure cookie
    // =========================
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: true, // true in HTTPS
      maxAge: 60 * 60 * 1000,
    });

    // =========================
    // 6️⃣ Return crypto material
    // =========================
    return res.json({
      message: "Login successful",
      crypto: {
        
        encrypted_master_key: Buffer.from(user.encrypted_master_key).toString(
          "base64"
        ),

        kdf_salt: Buffer.from(user.kdf_salt).toString("base64"),

        rsa_public_key: Buffer.from(user.rsa_public_key).toString("base64"),

        encrypted_rsa_private_key: Buffer.from(user.encrypted_rsa_private_key).toString("base64")


      },
    });
  } catch (error) {
    req.log?.error({ err: error }, "Login error");
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.auth_token;

    if (!token) {
      // Rien à révoquer, logout idempotent
      return res.status(204).send();
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest();

    await sequelize.query(
      `
      DELETE FROM auth_tokens
      WHERE token_hash = ?
      `,
      {
        replacements: [tokenHash],
        type: QueryTypes.DELETE,
      }
    );

    // Suppression du cookie côté client
    res.clearCookie("auth_token", {
      httpOnly: true,
      sameSite: "Lax",
      secure: false, // true en HTTPS
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
      SELECT id, is_verified, token_expiry
      FROM users
      WHERE verification_token = :token
      `,
      {
        replacements: { token },
        type: QueryTypes.SELECT,
      }
    );
    console.log(user);

    if (!user) {
      return res
        .status(400)
        .send(renderPage("Invalid or expired verification token", true));
    }

    // token expired
    if (user.token_expiry < new Date()) {
      await sequelize.query("DELETE FROM users WHERE id = :id", {
        replacements: { id: user.id },
        type: QueryTypes.DELETE,
      });

      return res
        .status(400)
        .send(
          renderPage(
            "Invalid or expired verification token, try registering again",
            true
          )
        );
    }

    // already verified
    if (user.is_verified) {
      return res.send(
        renderPage("✅ Email already verified. You can now log in.")
      );
    }

    await sequelize.query(
      `
  UPDATE users
  SET is_verified = true,
      verification_token = NULL,
      token_expiry = NULL
  WHERE id = :id
  `,
      {
        replacements: { id: user.id },
        type: QueryTypes.UPDATE,
      }
    );

    return res.send(
      renderPage("✅ Email verified successfully. You can now log in.")
    );
  } catch (error) {
    console.error("VERIFY EMAIL ERROR:", error);
    return res.status(500).send(renderPage("Internal server error", true));
  }
});

/*========================== RESET PASSWORD ==================*/

router.get("/crypto", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const users = await sequelize.query(
      `
      SELECT
        encrypted_master_key,
        encrypted_rsa_private_key,
        kdf_salt
      FROM users
      WHERE id = ?
      `,
      {
        replacements: [req.user.id],
        type: QueryTypes.SELECT,
      },
    );

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];

    return res.json({
      encrypted_master_key: Buffer.from(user.encrypted_master_key).toString(
        "base64",
      ),
      encrypted_private_key: Buffer.from(
        user.encrypted_rsa_private_key,
      ).toString("base64"),
      kdf_salt: Buffer.from(user.kdf_salt).toString("base64"),
    });
  } catch (err) {
    console.error("CRYPTO ROUTE ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*========================== ROTATE PASSWORD ==================*/

router.post("/crypto/rotate-password", authMiddleware, async (req, res) => {
  const { oldPassword, newPassword, encMK, encPrivateKey, kdfSalt } = req.body;

  if (!oldPassword || !newPassword || !encMK || !encPrivateKey || !kdfSalt) {
    return res.status(400).json({
      message: "Missing required fields",
    });
  }

  try {
    // =========================
    // Fetch user
    // =========================

    const users = await sequelize.query(
      `
      SELECT id, hashed_master_password
      FROM users
      WHERE id = ?
      `,
      {
        replacements: [req.user.id],
        type: QueryTypes.SELECT,
      },
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = users[0];

    // =========================
    // Verify current password
    // =========================

    const isMatch = await bcrypt.compare(
      oldPassword,
      user.hashed_master_password,
    );

    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    // =========================
    // Hash new password
    // =========================

    const newHashedPassword = await hashPassword(newPassword);

    // =========================
    // Update user crypto material
    // =========================

    await sequelize.query(
      `
      UPDATE users
      SET
        hashed_master_password = :hashedPassword,
        encrypted_master_key = :encMK,
        encrypted_rsa_private_key = :encPrivateKey,
        kdf_salt = :kdfSalt
      WHERE id = :id
      `,
      {
        replacements: {
          id: user.id,
          hashedPassword: newHashedPassword,
          encMK: Buffer.from(encMK, "base64"),
          encPrivateKey: Buffer.from(encPrivateKey, "base64"),
          kdfSalt: Buffer.from(kdfSalt, "base64"),
        },
        type: QueryTypes.UPDATE,
      },
    );

    // =========================
    // Invalidate all sessions
    // =========================

    await sequelize.query(
      `
      DELETE FROM auth_tokens
      WHERE user_id = ?
      `,
      {
        replacements: [user.id],
        type: QueryTypes.DELETE,
      },
    );

    return res.json({
      message: "Password and encryption material updated successfully",
    });
  } catch (err) {
    console.error("ROTATE PASSWORD ERROR:", err);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

module.exports = router;
