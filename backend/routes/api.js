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
      SELECT id, type, name, ciphertext, created_at, updated_at
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
      SELECT id, type, name, ciphertext, created_at, updated_at
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
  const { name, type, ciphertext } = req.body;

  // =========================
  // Validation minimale
  // =========================
  if (!name || !type || !ciphertext) {
    return res.status(400).json({
      message: "name, type and ciphertext are required"
    });
  }

  try {
    // =========================
    // Insert DB
    // =========================
    await sequelize.query(
      `
      INSERT INTO secrets
        (owner_id, name, type, ciphertext)
      VALUES
        (?, ?, ?, ?)
      `,
      {
        replacements: [
          userId,
          name,
          type,
          Buffer.from(ciphertext, "base64"),
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
  const { type, name, ciphertext } = req.body;
  console.log(type,name,ciphertext)

  if (!type || !name || !ciphertext) {
    return res.status(400).json({
      message: "type, name and ciphertextare required"
    });
  }

  try {
    const result = await sequelize.query(
      `
      UPDATE secrets
      SET type = ?, name = ?, ciphertext = ?, updated_at = NOW()
      WHERE id = ? AND owner_id = ?
      `,
      {
        replacements: [
          type,
          name,
          Buffer.from(ciphertext, "base64"),
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
  // 1. Récupération de encOsk envoyé par le front-end
  const { name, encOsk } = req.body;
  const userId = req.user.id;

  // Validations de base
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

  // Validation de la présence de la clé crypto
  if (!encOsk || typeof encOsk !== "string") {
    return res.status(400).json({
      error: "Encrypted OSK data is required."
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
        replacements: { name: name.trim() },
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

    // Le créateur devient membre 'owner' et on enregistre son OSK chiffrée
    // Utilisation de FROM_BASE64 pour convertir la string reçue en VARBINARY
    await sequelize.query(
      `
      INSERT INTO org_members
      (
        organization_id,
        user_id,
        role,
        protected_osk
      )
      VALUES
      (
        :organizationId,
        :userId,
        'owner',
        FROM_BASE64(:encOsk)
      )
      `,
      {
        replacements: {
          organizationId,
          userId,
          encOsk // La string Base64 concaténée (Nonce + Ciphertext)
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
        om.role, -- Ajout du rôle de l'utilisateur dans l'organisation
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
        o.created_at,
        om.role -- Requis dans le GROUP BY car om.role n'est pas une fonction d'agrégation

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

router.get("/org/:id", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const orgId = req.params.id;

  try {
    const organization = await sequelize.query(
      `
      SELECT 
        o.id, 
        o.name, 
        o.created_at,
        om.protected_osk, -- Récupération de l'OSK spécifique à cet utilisateur
        om.role,          -- Récupération du rôle de l'utilisateur (owner, admin, member)
        (SELECT COUNT(*) FROM organization_secrets WHERE organization_id = o.id) AS secret_count
      FROM organizations o
      INNER JOIN org_members om 
        ON om.organization_id = o.id
      WHERE om.user_id = :userId 
        AND o.id = :orgId
      LIMIT 1;
      `,
      {
        replacements: { userId, orgId },
        type: QueryTypes.SELECT
      }
    );

    if (!organization || organization.length === 0) {
      return res.status(404).json({ 
        message: "Organisation introuvable ou accès non autorisé." 
      });
    }

    // On renvoie l'organisation avec l'OSK protégée et le rôle
    res.json({
      organization: organization[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});

router.get("/org/:id/secrets", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const orgId = req.params.id;

  try {
    // Requête SQL optimisée : On récupère les secrets ET la protected_osk du membre demandeur
    const rows = await sequelize.query(
      `
      SELECT 
        os.id, 
        os.organization_id,
        o.name AS organization_name,
        os.type, 
        os.name, 
        os.encrypted_cipher_key, 
        os.ciphertext, 
        os.created_at, 
        os.updated_at,
        om.protected_osk
      FROM organization_secrets os
      INNER JOIN organizations o ON os.organization_id = o.id
      INNER JOIN org_members om ON o.id = om.organization_id
      WHERE o.id = :orgId AND om.user_id = :userId
      ORDER BY os.created_at DESC;
      `,
      {
        replacements: { orgId, userId },
        type: QueryTypes.SELECT
      }
    );

    // Si l'utilisateur n'est pas membre ou que l'orga n'existe pas, rows sera vide.
    // Mais attention : si l'orga existe, que le user est membre, mais qu'il n'y a juste AUCUN secret,
    // rows sera également vide ! Il faut donc gérer ça proprement.
    
    let protectedOskBase64 = null;

    // Si on a des lignes, on extrait la protected_osk de la première ligne
    if (rows.length > 0) {
      protectedOskBase64 = Buffer.from(rows[0].protected_osk).toString("base64");
    } else {
      // Optionnel / Sécurité : Si la liste est vide, on vérifie si le user est au moins membre
      // pour lui renvoyer sa protected_osk même s'il n'y a aucun secret à afficher.
      const memberCheck = await sequelize.query(
        `SELECT protected_osk FROM org_members WHERE organization_id = :orgId AND user_id = :userId LIMIT 1;`,
        {
          replacements: { orgId, userId },
          type: QueryTypes.SELECT
        }
      );

      if (memberCheck.length === 0) {
        return res.status(403).json({ message: "Access denied or organization not found" });
      }
      
      protectedOskBase64 = Buffer.from(memberCheck[0].protected_osk).toString("base64");
    }

    // Formatage des secrets (VARBINARY -> Base64)
    const formattedSecrets = rows.map(secret => ({
      id: secret.id,
      organization_id: secret.organization_id,
      organization_name: secret.organization_name,
      type: secret.type,
      name: secret.name,
      encrypted_cipher_key: Buffer.from(secret.encrypted_cipher_key).toString("base64"),
      ciphertext: Buffer.from(secret.ciphertext).toString("base64"),
      created_at: secret.created_at,
      updated_at: secret.updated_at
    }));

    // On renvoie l'enveloppe contenant la clé de l'orga ET les secrets associés
    return res.status(200).json({
      protected_osk: protectedOskBase64,
      secrets: formattedSecrets
    });

  } catch (error) {
    console.error("List organization secrets error:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

router.post("/org/:organizationId/secrets", authMiddleware, async (req, res) => {

  const userId = req.user.id
  console.log("")

  const {
    organizationId,
    name,
    type,
    encryptedCipherKey,
    ciphertext
  } = req.body

  console.log(req.body)

  if (
    !organizationId ||
    !name ||
    !type ||
    !encryptedCipherKey ||
    !ciphertext
  ) {
    return res.status(400).json({
      message: "organizationId, name, type, encryptedCipherKey and ciphertext are required"
    })
  }

  try {

    // ============================
    // Vérifie que le user appartient
    // à l'organisation
    // ============================

    const member = await sequelize.query(
      `
      SELECT 1
      FROM org_members
      WHERE organization_id = :organizationId
      AND user_id = :userId
      LIMIT 1
      `,
      {
        replacements: {
          organizationId,
          userId
        },
        type: QueryTypes.SELECT
      }
    )

    if (member.length === 0) {
      return res.status(403).json({
        message: "You are not a member of this organization."
      })
    }

    // ============================
    // Création du secret
    // ============================

    await sequelize.query(
      `
      INSERT INTO organization_secrets
      (
        organization_id,
        type,
        name,
        encrypted_cipher_key,
        ciphertext
      )
      VALUES
      (
        :organizationId,
        :type,
        :name,
        FROM_BASE64(:encryptedCipherKey),
        FROM_BASE64(:ciphertext)
      )
      `,
      {
        replacements: {
          organizationId,
          type,
          name,
          encryptedCipherKey,
          ciphertext
        },
        type: QueryTypes.INSERT
      }
    )

    return res.status(201).json({
      message: "Organization secret created successfully"
    })

  } catch (err) {

    req.log?.error(
      {
        err,
        userId,
        organizationId
      },
      "Create organization secret error"
    )

    return res.status(500).json({
      message: "Internal server error", err
    })
  }

})


router.delete("/org/:id", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const orgId = req.params.id;

  try {
    // Vérification de la légitimité et des droits (Rôle) de l'utilisateur
    const memberCheck = await sequelize.query(
      `
      SELECT role 
      FROM org_members 
      WHERE user_id = :userId AND organization_id = :orgId
      LIMIT 1;
      `,
      {
        replacements: { userId, orgId },
        type: QueryTypes.SELECT
      }
    );

    // Si l'utilisateur n'est pas trouvé dans la table de pivot, il n'appartient pas à l'org
    if (!memberCheck || memberCheck.length === 0) {
      return res.status(404).json({ 
        message: "Organisation introuvable ou vous n'en êtes pas membre." 
      });
    }

    const userRole = memberCheck[0].role;

    // Seuls le créateur ('owner') ou un 'admin' peuvent supprimer l'organisation
    if (userRole !== 'owner' && userRole !== 'admin') {
      return res.status(403).json({ 
        message: "Action non autorisée. Vous devez être administrateur ou propriétaire pour supprimer cette organisation." 
      });
    }

    // Suppression de l'organisation
    await sequelize.query(
      `
      DELETE FROM organizations 
      WHERE id = :orgId;
      `,
      {
        replacements: { orgId },
        type: QueryTypes.DELETE
      }
    );

    res.json({
      message: "L'organisation et toutes ses données associées ont été supprimées avec succès."
    });

  } catch (err) {
    console.error("Erreur lors de la suppression de l'organisation :", err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});

module.exports = router;
