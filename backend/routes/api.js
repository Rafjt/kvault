const express = require("express");
const app = express();
const router = express.Router();
const sequelize = require("../database");
const { QueryTypes } = require("sequelize");
const {authMiddleware} = require("../middleware/auth.middleware.js")

router.get('/about', (req, res) => {
    res.send('About this app');
});

router.get("/check", authMiddleware, (req, res) => {
  return res.status(200).json({ status: "OK" });
});


router.post("/create", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { type, ciphertext, nonce } = req.body;

  if (!type || !ciphertext || !nonce) {
    return res.status(400).json({
      message: "type, ciphertext and nonce are required"
    });
  }

  try {
    await sequelize.query(
      `
      INSERT INTO secrets (owner_id, type, ciphertext, nonce)
      VALUES (?, ?, ?, ?)
      `,
      {
        replacements: [
          userId,
          type,
          Buffer.from(ciphertext, "base64"),
          Buffer.from(nonce, "base64")
        ],
        type: QueryTypes.INSERT
      }
    );

    return res.status(201).json({
      message: "Secret created successfully"
    });

  } catch (error) {
    req.log?.error({ err: error, userId }, "Create secret error");
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


router.put("/update/:id", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const secretId = req.params.id;
  const { type, ciphertext, nonce } = req.body;

  if (!type || !ciphertext || !nonce) {
    return res.status(400).json({
      message: "type, ciphertext and nonce are required"
    });
  }

  try {
    const result = await sequelize.query(
      `
      UPDATE secrets
      SET type = ?, ciphertext = ?, nonce = ?, updated_at = NOW()
      WHERE id = ? AND owner_id = ?
      `,
      {
        replacements: [
          type,
          Buffer.from(ciphertext, "base64"),
          Buffer.from(nonce, "base64"),
          secretId,
          userId
        ],
        type: QueryTypes.UPDATE
      }
    );

    if (result[1] === 0) {
      return res.status(404).json({
        message: "Secret not found or access denied"
      });
    }

    return res.status(200).json({
      message: "Secret updated successfully"
    });

  } catch (error) {
    req.log?.error({ err: error, userId, secretId }, "Update secret error");
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


module.exports = router;