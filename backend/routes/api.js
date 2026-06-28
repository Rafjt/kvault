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

/* ========================= SECRETS ========================= */

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

router.get("/secrets/:id", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const secretId = req.params.id;

  try {
    const secrets = await sequelize.query(
      `
      SELECT id, type, name, ciphertext, nonce, created_at, updated_at
      FROM secrets
      WHERE owner_id = ? AND id = ?
      LIMIT 1
      `,
      {
        replacements: [userId, secretId],
        type: QueryTypes.SELECT
      }
    );

    const secret = secrets[0];

    if (!secret) {
      return res.status(404).json({
        message: "Secret not found"
      });
    }

    const formattedSecret = {
      id: secret.id,
      type: secret.type,
      name: secret.name,
      ciphertext: Buffer.from(secret.ciphertext).toString("base64"),
      nonce: Buffer.from(secret.nonce).toString("base64"),
      created_at: secret.created_at,
      updated_at: secret.updated_at
    };

    return res.status(200).json(formattedSecret);
  } catch (error) {
    req.log?.error({ err: error, userId }, "Get secret error");
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

/* ========================= ORGANIZATIONS ========================= */

router.post("/org/create", authMiddleware, async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({
      error: "Organization name is required."
    });
  }

  if (name.length > 255) {
    return res.status(400).json({
      error: "Organization name cannot exceed 255 characters."
    });
  }

  const transaction = await sequelize.transaction();

  try {

    // Vérifie qu'une organisation du même nom n'existe pas
    const existing = await sequelize.query(
      `
      SELECT id
      FROM organizations
      WHERE name = :name
      `,
      {
        replacements: {
          name: name.trim()
        },
        type: QueryTypes.SELECT,
        transaction
      }
    );

    if (existing.length > 0) {
      await transaction.rollback();

      return res.status(409).json({
        error: "An organization with this name already exists."
      });
    }

    // Création de l'organisation
    const [result] = await sequelize.query(
      `
      INSERT INTO organizations (name, created_by)
      VALUES (:name, :createdBy)
      `,
      {
        replacements: {
          name: name.trim(),
          createdBy: userId
        },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    const organizationId = result;

    // Le créateur devient automatiquement membre
    await sequelize.query(
      `
      INSERT INTO org_members
      (
        organization_id,
        user_id,
        role
      )
      VALUES
      (
        :organizationId,
        :userId,
        'owner'
      )
      `,
      {
        replacements: {
          organizationId,
          userId
        },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();

    return res.status(201).json({
      message: "Organization created successfully.",
      organization: {
        id: organizationId,
        name: name.trim()
      }
    });

  } catch (err) {

    await transaction.rollback();

    console.error(err);

    return res.status(500).json({
      error: "Internal server error"
    });

  }
});

router.get("/org", authMiddleware, async (req, res) => {

  const userId = req.user.id

  try {

    const organizations = await sequelize.query(
      `
      SELECT
        o.id,
        o.name,
        o.created_at,
        COUNT(os.id) AS secret_count
      FROM organizations o

      INNER JOIN org_members om
        ON om.organization_id = o.id

      LEFT JOIN organization_secrets os
        ON os.organization_id = o.id

      WHERE om.user_id = :userId

      GROUP BY
        o.id,
        o.name,
        o.created_at

      ORDER BY o.name
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    )

    console.log(organizations)
    res.json({
      organizations
    })

  } catch (err) {

    console.error(err)

    res.status(500).json({
      message: "Internal server error"
    })

  }

})

router.get("/org/secrets", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { type, name } = req.query;

  try {
    // Construction de la clause WHERE dynamique pour les filtres optionnels
    let filterClause = "";
    const replacements = { userId };

    if (type) {
      filterClause += " AND os.type = :type";
      replacements.type = type;
    }

    if (name) {
      filterClause += " AND os.name LIKE :name";
      replacements.name = `%${name}%`;
    }

    // Requête SQL : On sélectionne les secrets des organisations où l'utilisateur est membre
    const secrets = await sequelize.query(
      `
      SELECT 
        os.id, 
        os.organization_id,
        o.name AS organization_name,
        os.type, 
        os.name, 
        os.encrypted_cipher_key, 
        os.ciphertext, 
        os.nonce, 
        os.created_at, 
        os.updated_at
      FROM organization_secrets os
      INNER JOIN organizations o ON os.organization_id = o.id
      INNER JOIN org_members om ON o.id = om.organization_id
      WHERE om.user_id = :userId
      ${filterClause}
      ORDER BY os.created_at DESC
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    // Formatage des données binaires (VARBINARY -> Base64)
    const formattedSecrets = secrets.map(secret => ({
      id: secret.id,
      organization_id: secret.organization_id,
      organization_name: secret.organization_name, // Pratique pour l'UI côté front
      type: secret.type,
      name: secret.name,
      encrypted_cipher_key: Buffer.from(secret.encrypted_cipher_key).toString("base64"),
      ciphertext: Buffer.from(secret.ciphertext).toString("base64"),
      nonce: Buffer.from(secret.nonce).toString("base64"),
      created_at: secret.created_at,
      updated_at: secret.updated_at
    }));

    return res.status(200).json({
      secrets: formattedSecrets
    });

  } catch (error) {
    req.log?.error({ err: error, userId }, "List all accessible organization secrets error");
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

module.exports = router;
