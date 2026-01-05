import crypto from "crypto";
import { QueryTypes } from "sequelize";
import sequelize from "../database.js";

export async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.auth_token;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Hash du token
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest();

    // Lookup DB
    const rows = await sequelize.query(
      `
      SELECT user_id, expires_at
      FROM auth_tokens
      WHERE token_hash = ?
      `,
      {
        replacements: [tokenHash],
        type: QueryTypes.SELECT
      }
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const { user_id, expires_at } = rows[0];

    // Vérification expiration
    if (new Date(expires_at) < new Date()) {
      // Nettoyage défensif
      await sequelize.query(
        `DELETE FROM auth_tokens WHERE token_hash = ?`,
        {
          replacements: [tokenHash],
          type: QueryTypes.DELETE
        }
      );

      return res.status(401).json({ message: "Token expired" });
    }

    // Attache l'utilisateur à la requête
    req.user = { id: user_id };

    next();

  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
