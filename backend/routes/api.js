const express = require("express");
const router = express.Router();
const sequelize = require("../database");
const { QueryTypes } = require("sequelize");
const { authMiddleware } = require("../middleware/auth.middleware.js");

/**
 * Route info
 */
router.get("/about", (req, res) => {
  res.send("About this app");
});

/**
 * Route de test auth
 */
router.get("/check", authMiddleware, (req, res) => {
  return res.status(200).json({ status: "OK" });
});

router.get("/secrets", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  // Filtres optionnels
  const { type, name } = req.query;

  let whereClause = "WHERE owner_id = ?";
  const replacements = [userId];

  if (type) {
    whereClause += " AND type = ?";
    replacements.push(type);
  }

  if (name) {
    whereClause += " AND name LIKE ?";
    replacements.push(`%${name}%`);
  }

  try {
    const secrets = await sequelize.query(
      `
      SELECT id, type, name, ciphertext, nonce, created_at, updated_at
      FROM secrets
      ${whereClause}
      ORDER BY created_at DESC
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    const formattedSecrets = secrets.map(secret => ({
      id: secret.id,
      type: secret.type,
      name: secret.name,
      ciphertext: Buffer.from(secret.ciphertext).toString("base64"),
      nonce: Buffer.from(secret.nonce).toString("base64"),
      created_at: secret.created_at,
      updated_at: secret.updated_at
    }));

    return res.status(200).json({
      secrets: formattedSecrets
    });

  } catch (error) {
    req.log?.error({ err: error, userId }, "List secrets error");
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


/**
 * CREATE secret
 */
router.post("/create", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, type, ciphertext, nonce } = req.body;

  // =========================
  // Validation minimale
  // =========================
  if (!name || !type || !ciphertext || !nonce) {
    return res.status(400).json({
      message: "name, type, ciphertext and nonce are required"
    });
  }

  try {
    // =========================
    // Insert DB
    // =========================
    await sequelize.query(
      `
      INSERT INTO secrets
        (owner_id, name, type, ciphertext, nonce)
      VALUES
        (?, ?, ?, ?, ?)
      `,
      {
        replacements: [
          userId,
          name,
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
    req.log?.error(
      { err: error, userId },
      "Create secret error"
    );

    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

/**
 * UPDATE secret
 */
router.put("/update/:id", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const secretId = req.params.id;
  const { type, name, ciphertext, nonce } = req.body;

  if (!type || !name || !ciphertext || !nonce) {
    return res.status(400).json({
      message: "type, name, ciphertext and nonce are required"
    });
  }

  try {
    const result = await sequelize.query(
      `
      UPDATE secrets
      SET type = ?, name = ?, ciphertext = ?, nonce = ?, updated_at = NOW()
      WHERE id = ? AND owner_id = ?
      `,
      {
        replacements: [
          type,
          name,
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

router.delete("/delete/:id", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const secretId = req.params.id;

  try {
    const deletedCount = await sequelize.query(
      `
      DELETE FROM secrets
      WHERE id = ? AND owner_id = ?
      `,
      {
        replacements: [secretId, userId],
        type: QueryTypes.DELETE
      }
    );

    if (deletedCount === 0) {
      return res.status(404).json({
        message: "Secret not found or access denied"
      });
    }

    return res.status(200).json({
      message: "Secret deleted successfully"
    });

  } catch (error) {
    req.log?.error({ err: error, userId, secretId }, "Delete secret error");
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});



module.exports = router;
