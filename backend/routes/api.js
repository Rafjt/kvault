const express = require("express");
const router = express.Router();
const sequelize = require("../database");
const { QueryTypes } = require("sequelize");
const { authMiddleware } = require("../middleware/auth.middleware.js");
const crypto = require("crypto");

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

  const whereClause = "WHERE owner_id = ?";
  const replacements = [userId];

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
    // 1. Récupérer les organisations dont l'utilisateur est déjà membre
    const organizations = await sequelize.query(
      `
      SELECT
        o.id,
        o.name,
        o.created_at,
        om.role,
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
        om.role
      ORDER BY o.name
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    )

    // 2. Récupérer les invitations EN ATTENTE reçues par cet utilisateur
    // On fait une sous-requête pour lier le 'login' de l'utilisateur connecté
    const invitations = await sequelize.query(
      `
      SELECT 
        oi.id AS invitation_id,
        oi.role AS invited_role,
        oi.status,
        oi.token,
        oi.expires_at,
        oi.created_at AS invited_at,
        o.id AS organization_id,
        o.name AS organization_name,
        u.login AS sender_login
      FROM organization_invitations oi
      INNER JOIN organizations o 
        ON oi.organization_id = o.id
      INNER JOIN users u 
        ON oi.invited_by = u.id
      WHERE oi.login = (SELECT login FROM users WHERE id = :userId)
        AND oi.status = 'pending'
        AND oi.expires_at > NOW() -- Sécurité pour ne pas afficher les invitations expirées dans le temps
      ORDER BY oi.created_at DESC;
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    )

    // 3. Retourner les deux listes au front-end
    res.json({
      organizations,
      invitations
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

router.get("/org/:orgid/secret/:secretid", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { orgid, secretid } = req.params;

  try {
    // 1. Vérifier d'abord si l'utilisateur fait partie de l'organisation
    // et récupérer sa protected_osk par la même occasion
    const memberCheck = await sequelize.query(
      `
      SELECT protected_osk 
      FROM org_members 
      WHERE organization_id = :orgid AND user_id = :userId 
      LIMIT 1;
      `,
      {
        replacements: { orgid, userId },
        type: QueryTypes.SELECT
      }
    );

    // Si aucune ligne n'est retournée, l'utilisateur n'est pas membre (ou l'org n'existe pas)
    if (memberCheck.length === 0) {
      return res.status(403).json({
        message: "Access denied. You are not a member of this organization."
      });
    }

    const protectedOskBase64 = Buffer.from(memberCheck[0].protected_osk).toString("base64");

    // 2. Récupérer le secret spécifique lié à cette organisation
    const secretRows = await sequelize.query(
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
        os.updated_at
      FROM organization_secrets os
      INNER JOIN organizations o ON os.organization_id = o.id
      WHERE os.id = :secretid AND os.organization_id = :orgid
      LIMIT 1;
      `,
      {
        replacements: { secretid, orgid },
        type: QueryTypes.SELECT
      }
    );

    // Si le secret n'existe pas ou n'appartient pas à cette orga
    if (secretRows.length === 0) {
      return res.status(404).json({
        message: "Secret not found in this organization."
      });
    }

    const secret = secretRows[0];

    // 3. Formatage des données binaires en Base64
    const formattedSecret = {
      id: secret.id,
      organization_id: secret.organization_id,
      organization_name: secret.organization_name,
      type: secret.type,
      name: secret.name,
      encrypted_cipher_key: Buffer.from(secret.encrypted_cipher_key).toString("base64"),
      ciphertext: Buffer.from(secret.ciphertext).toString("base64"),
      created_at: secret.created_at,
      updated_at: secret.updated_at
    };

    // Tout est OK : On renvoie la clé de l'orga et le secret ciblé
    return res.status(200).json({
      protected_osk: protectedOskBase64,
      secret: formattedSecret
    });

  } catch (error) {
    console.error("Fetch single organization secret error:", error);
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
        message: "Access denied. Only organization owners and admins can delete organizations." 
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

router.delete("/org/secret/:secretId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const secretId = req.params.secretId;
  const { orgId } = req.body;

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

    // Seuls le créateur ('owner') ou un 'admin' peuvent supprimer le secret
    if (userRole !== 'owner' && userRole !== 'admin') {
      return res.status(403).json({ 
        message: "Access denied. Only organization owners and admins can delete secrets." 
      });
    }

    // Suppression de l'organisation
    await sequelize.query(
      `
      DELETE FROM organization_secrets 
      WHERE id = :secretId;
      `,
      {
        replacements: { secretId },
        type: QueryTypes.DELETE
      }
    );

    res.json({
      message: "Le a été supprimées avec succès."
    });

  } catch (err) {
    console.error("Erreur lors de la suppression de l'organisation :", err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});

router.put("/org/:orgid/secret/:secretid", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { orgid, secretid } = req.params;
  const { name, type, ciphertext, encrypted_cipher_key } = req.body;

  if (!name || !type || !ciphertext || !encrypted_cipher_key) {
    return res.status(400).json({
      message: "Missing required fields: name, type, ciphertext, or encrypted_cipher_key."
    });
  }

  try {
    const memberCheck = await sequelize.query(
      `
      SELECT role 
      FROM org_members 
      WHERE organization_id = :orgid AND user_id = :userId 
      LIMIT 1;
      `,
      {
        replacements: { orgid, userId },
        type: QueryTypes.SELECT
      }
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({
        message: "Access denied. You are not a member of this organization."
      });
    }

    const userRole = memberCheck[0].role;
    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only organization owners and admins can update secrets."
      });
    }

    const secretCheck = await sequelize.query(
      `
      SELECT id 
      FROM organization_secrets 
      WHERE id = :secretid AND organization_id = :orgid 
      LIMIT 1;
      `,
      {
        replacements: { secretid, orgid },
        type: QueryTypes.SELECT
      }
    );

    if (secretCheck.length === 0) {
      return res.status(404).json({
        message: "Secret not found in this organization."
      });
    }

    const ciphertextBuffer = Buffer.from(ciphertext, "base64");
    const encryptedKeyBuffer = Buffer.from(encrypted_cipher_key, "base64");

    await sequelize.query(
      `
      UPDATE organization_secrets
      SET 
        name = :name,
        type = :type,
        ciphertext = :ciphertextBuffer,
        encrypted_cipher_key = :encryptedKeyBuffer,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = :secretid AND organization_id = :orgid;
      `,
      {
        replacements: {
          name,
          type,
          ciphertextBuffer,
          encryptedKeyBuffer,
          secretid,
          orgid
        },
        type: QueryTypes.UPDATE
      }
    );

    return res.status(200).json({
      message: "Organization secret updated successfully."
    });

  } catch (error) {
    console.error("Update organization secret error:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

/* ========================= INVITATIONS ========================= */


// Créer une invitation 
router.post("/org/:orgid/invite", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { orgid } = req.params;
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ message: "Missing required fields: email or role." });
  }

  if (!["member", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role. Must be 'member' or 'admin'." });
  }

  try {
    // 1. Vérifier si l'expéditeur est admin ou owner de l'organisation
    const senderCheck = await sequelize.query(
      `SELECT role FROM org_members WHERE organization_id = :orgid AND user_id = :userId LIMIT 1;`,
      { replacements: { orgid, userId }, type: QueryTypes.SELECT }
    );

    if (senderCheck.length === 0 || !["owner", "admin"].includes(senderCheck[0].role)) {
      return res.status(403).json({ message: "Access denied. Only admins and owners can invite." });
    }

    // 2. Vérifier si l'utilisateur ciblé est DÉJÀ membre de l'organisation
    const targetUser = await sequelize.query(
      `SELECT id FROM users WHERE login = :email LIMIT 1;`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    if (targetUser.length > 0) {
      const alreadyMember = await sequelize.query(
        `SELECT 1 FROM org_members WHERE organization_id = :orgid AND user_id = :targetId LIMIT 1;`,
        { replacements: { orgid, targetId: targetUser[0].id }, type: QueryTypes.SELECT }
      );
      if (alreadyMember.length > 0) {
        return res.status(400).json({ message: "This user is already a member of this organization." });
      }
    }

    // 3. Annuler les anciennes invitations en attente pour cet email dans cette orga
    await sequelize.query(
      `UPDATE organization_invitations SET status = 'expired' WHERE organization_id = :orgid AND login = :email AND status = 'pending';`,
      { replacements: { orgid, email }, type: QueryTypes.UPDATE }
    );

    // 4. Créer la nouvelle invitation (expiration dans 48h)
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    await sequelize.query(
      `INSERT INTO organization_invitations (organization_id, login, invited_by, role, status, token, expires_at)
       VALUES (:orgid, :email, :userId, :role, 'pending', :token, :expiresAt);`,
      { replacements: { orgid, email, userId, role, token, expiresAt }, type: QueryTypes.INSERT }
    );

    // TODO: Envoyer un email ici avec le lien contenant le token
    // https://tonsite.com/invite/accept?token=${token}

    return res.status(201).json({
      message: "Invitation created successfully.",
      token // Tu le renvoies si tu gères l'envoi de mail côté client ou pour tester
    });

  } catch (error) {
    console.error("Create invitation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Accepter l'invitation
router.post("/invite/:token/accept", authMiddleware, async (req, res) => {
  const { token } = req.params;
  const userId = req.user.id;

  try {
    // 1. Récupérer et valider l'invitation
    const invitationRows = await sequelize.query(
      `SELECT * FROM organization_invitations WHERE token = :token LIMIT 1;`,
      { replacements: { token }, type: QueryTypes.SELECT }
    );

    if (invitationRows.length === 0) {
      return res.status(404).json({ message: "Invitation not found." });
    }

    const invite = invitationRows[0];

    // 2. Sécurité : Vérifier le login associé à l'ID
    const userCheck = await sequelize.query(
      `SELECT 1 FROM users WHERE id = :userId AND login = :inviteLogin LIMIT 1;`,
      { replacements: { userId, inviteLogin: invite.login }, type: QueryTypes.SELECT }
    );

    if (userCheck.length === 0) {
      return res.status(403).json({ message: "This invitation was sent to a different account." });
    }

    if (invite.status !== "pending" || new Date() > new Date(invite.expires_at)) {
      return res.status(400).json({ message: "Invitation expired or already processed." });
    }

    // 3. Mettre à jour uniquement le statut de l'invitation (L'utilisateur n'est pas encore membre !)
    await sequelize.query(
      `UPDATE organization_invitations SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = :id;`,
      { replacements: { id: invite.id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ 
      message: "Invitation accepted! Waiting for an administrator to transmit your security key.",
      organization_id: invite.organization_id
    });

  } catch (error) {
    console.error("Accept invitation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


// Récupérer les invitations acceptées à confirmer
router.get("/org/:orgid/invitations/pending-confirm", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { orgid } = req.params;

  try {
    // 1. Vérifier que l'appelant est bien Admin ou Owner de l'organisation
    const memberCheck = await sequelize.query(
      `SELECT role FROM org_members WHERE organization_id = :orgid AND user_id = :userId LIMIT 1;`,
      { replacements: { orgid, userId }, type: QueryTypes.SELECT }
    );

    if (memberCheck.length === 0 || !["owner", "admin"].includes(memberCheck[0].role)) {
      return res.status(403).json({ 
        message: "Access denied. Only organization owners and admins can view pending confirmations." 
      });
    }

    // 2. Récupérer les invitations acceptées et les clés publiques des utilisateurs correspondants
    const pendingConfirms = await sequelize.query(
      `
      SELECT 
        oi.id AS invitation_id,
        oi.login,
        oi.role AS assigned_role,
        u.id AS user_id,
        u.login,
        u.rsa_public_key
      FROM organization_invitations oi
      INNER JOIN users u ON LOWER(oi.login) = LOWER(u.login)
      WHERE oi.organization_id = :orgid AND oi.status = 'accepted'
      `,
      { replacements: { orgid }, type: QueryTypes.SELECT }
    );

    // Formater la clé publique en chaîne de caractères (depuis le BLOB) pour le Front-end
    const formattedList = pendingConfirms.map(row => ({
      invitation_id: row.invitation_id,
      user_id: row.user_id,
      email: row.email,
      login: row.login,
      assigned_role: row.assigned_role,
      rsa_public_key: row.rsa_public_key ? row.rsa_public_key.toString("base64") : null
    }));

    return res.status(200).json(formattedList);

  } catch (error) {
    console.error("Fetch pending confirmations error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Confirmer et pousser l'OSK chiffrée
router.put("/org/:orgid/invitations/:invitationid/confirm", authMiddleware, async (req, res) => {
  const adminId = req.user.id;
  const { orgid, invitationid } = req.params;
  const { protected_osk } = req.body; 

  if (!protected_osk) {
    return res.status(400).json({ message: "Missing required field: protected_osk." });
  }

  try {
    // 1. Vérifier les droits de l'admin
    const adminCheck = await sequelize.query(
      `SELECT role FROM org_members WHERE organization_id = :orgid AND user_id = :adminId LIMIT 1;`,
      { replacements: { orgid, adminId }, type: QueryTypes.SELECT }
    );

    if (adminCheck.length === 0 || !["owner", "admin"].includes(adminCheck[0].role)) {
      return res.status(403).json({ message: "Access denied. Action restricted to owners and admins." });
    }

    // 2. Récupérer l'invitation
    const invitationRows = await sequelize.query(
      `SELECT * FROM organization_invitations WHERE id = :invitationid AND organization_id = :orgid LIMIT 1;`,
      { replacements: { invitationid, orgid }, type: QueryTypes.SELECT }
    );

    if (invitationRows.length === 0) {
      return res.status(404).json({ message: "Invitation not found in this organization." });
    }

    const invitation = invitationRows[0];

    if (invitation.status !== "accepted") {
      return res.status(400).json({ message: "Cannot confirm this invitation. Status must be 'accepted'." });
    }

    // 3. Trouver le user_id correspondant au login de l'invitation
    const userRows = await sequelize.query(
      `SELECT id FROM users WHERE login = :login LIMIT 1;`,
      { replacements: { login: invitation.login }, type: QueryTypes.SELECT }
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "The invited user no longer exists in the system." });
    }

    const targetUserId = userRows[0].id;
    const oskBuffer = Buffer.from(protected_osk, "base64");

    // 4. Transaction : Création du membre ET archivage de l'invitation
    await sequelize.transaction(async (t) => {
      
      // INSERTION OFFICIELLE DU MEMBRE (Il apparaît enfin dans ses groupes !)
      await sequelize.query(
        `
        INSERT INTO org_members (organization_id, user_id, role, protected_osk)
        VALUES (:orgid, :targetUserId, :role, :oskBuffer);
        `,
        { 
          replacements: { orgid, targetUserId, role: invitation.role, oskBuffer }, 
          transaction: t, 
          type: QueryTypes.INSERT 
        }
      );

      // On clôture l'invitation avec un statut 'completed'
      await sequelize.query(
        `UPDATE organization_invitations SET status = 'completed' WHERE id = :invitationid;`,
        { replacements: { invitationid }, transaction: t, type: QueryTypes.UPDATE }
      );
    });

    return res.status(200).json({ 
      message: "User membership confirmed successfully. The group will now appear on their dashboard." 
    });

  } catch (error) {
    console.error("Confirm membership error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Récupérer toutes les invitations en attente reçues par l'utilisateur connecté
router.get("/org/invitations/pending", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const pendingInvitations = await sequelize.query(
      `
      SELECT 
        oi.id AS invitation_id,
        oi.role AS invited_role,
        oi.status,
        oi.token,
        oi.expires_at,
        oi.created_at AS invited_at,
        o.id AS organization_id,
        o.name AS organization_name,
        u.login AS sender_login
      FROM organization_invitations oi
      INNER JOIN organizations o 
        ON oi.organization_id = o.id
      INNER JOIN users u 
        ON oi.invited_by = u.id
      WHERE oi.login = (SELECT login FROM users WHERE id = :userId)
        AND oi.status = 'pending'
        AND oi.expires_at > NOW()
      ORDER BY oi.created_at DESC;
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      invitations: pendingInvitations
    });

  } catch (error) {
    console.error("Fetch pending invitations error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
