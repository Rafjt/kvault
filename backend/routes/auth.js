const express = require("express");
const sequelize = require("../database");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
// const sendMail = require("../mailer");
const { QueryTypes } = require("sequelize");
const { Limiter } = require('../functions')
const validator = require("validator");
const { hashPassword } = require("../functions/functions");

router.get('/about', (req, res) => {
    res.send('About the auth');
});

router.post("/register",Limiter, async (req, res) => {
  const { email, password } = req.body;
  Hashedpassword = await hashPassword(password)
  req.log?.info({ email }, 'Register attempt');

  if (!email || !password) {
    req.log?.warn({ email }, 'Missing email or password');
    return res.status(400).json({ error: "Email and hashed password are required." });
  }

  if (!validator.isEmail(email)) {
    req.log?.warn({ email }, 'Invalid email format');
    return res.status(400).json({ error: "Invalid email format." });
  }

  try {
    const existingUser = await sequelize.query(
      "SELECT id FROM users WHERE login = :email",
      { replacements: { email }, type: sequelize.QueryTypes.SELECT }
    );

    if (existingUser.length > 0) {
      req.log?.warn({ email }, 'Email already registered');
      return res.status(409).json({ error: "Email already registered." });
    }


    await sequelize.query(
      `INSERT INTO users 
        (login, hashed_master_password, is_verified, verification_token, kdf_salt, encrypted_master_key) 
       VALUES 
        (:email, :Hashedpassword, TRUE, null, "0", "0");`,
      {
        replacements: { email, Hashedpassword },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    req.log?.info({ email }, 'User registered, verification email sent');
/*
    const verificationLink = `https://rrpm.site/auth/verify-email?token=${verificationToken}`;
    const html = `<div style="font-family: Arial, sans-serif; text-align: center;">
    <h2>Welcome to RRPM 👋</h2>
    <p>Click the button below to verify your email address:</p>
    <a href="${verificationLink}" 
       style="
         display: inline-block;
         padding: 12px 20px;
         margin-top: 10px;
         font-size: 16px;
         font-weight: bold;
         color: white;
         background-color: #007BFF;
         border-radius: 6px;
         text-decoration: none;
       ">
      Verify Email
    </a>
  </div>`;
    await sendMail(
      email,
      "Verify Your Email",
      `Click the link: ${verificationLink}`,
      html
    );
*/
//     return res.status(201).json({
//       message: "User registered. Please verify your email before logging in.",
//     });
//   } catch (error) {
//     req.log?.error({ err: error, email }, 'Error during registration');
//     return res.status(500).json({ error: "Internal server error" });
//   }
// });

    return res.status(201).json({
      message: "User registered successfully (email verification disabled for now).",
    });
  } catch (error) {
    console.error(error);
    req.log?.error({ err: error, email }, 'Error during registration');
    return res.status(500).json({ error: "Internal server error" });
  }
});



// function renderPage(message, isError = false) {
//   return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Email Verification</title><style>body {font-family: system-ui, sans-serif;background: ${isError ? "#ffe6e6" : "#f0fdf4"};color: ${isError ? "#991b1b" : "#065f46"};display: flex;align-items: center;justify-content: center;height: 100vh;margin: 0;padding: 1rem;} .container {text-align: center;background: white;padding: 2rem;border-radius: 1rem;box-shadow: 0 10px 20px rgba(0,0,0,0.1);max-width: 400px;width: 100%;} h1 {font-size: 1.5rem;margin-bottom: 1rem;} p {font-size: 1rem;} .success {color: #16a34a;} .error {color: #dc2626;}</style></head><body><div class="container"><h1 class="${isError ? "error" : "success"}">${message}</h1></div></body></html>`;
// }


router.post("/login", Limiter, async (req, res) => {
  const { email, password } = req.body;
  req.log?.info({ email }, "Login attempt");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const users = await sequelize.query(
      `
      SELECT id, login, hashed_master_password, is_verified
      FROM users
      WHERE login = ?
      `,
      { replacements: [email], type: QueryTypes.SELECT }
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { id, hashed_master_password, is_verified } = users[0];

    if (!is_verified) {
      return res.status(403).json({ message: "Account not verified" });
    }

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

    req.log?.info({ userId: id }, "Login successful");
    return res.json({ message: "Login successful" });

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



module.exports = router;