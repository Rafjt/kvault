import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "k8vault@gmail.com",
    pass: process.env.KVAULT_MAIL_PWD,
  },
});

export const sendMail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: "k8vault@gmail.com",
      to,
      subject,
      text,
      html,
    });

    console.log("Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};


export const sendTokenMail = async (verificationToken, email) => {
  const verificationLink = `http://kvault.local/auth/verify-email?token=${verificationToken}`;

  const html = `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vérification Email</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f7fb; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb; padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg, #2563eb, #4f46e5); padding:40px; text-align:center;">
                <h1 style="margin:0; color:white; font-size:28px;">
                  KVault 🔐
                </h1>
                <p style="margin-top:10px; color:#dbeafe; font-size:16px;">
                  Vérifie ton adresse email
                </p>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin-top:0; color:#111827; font-size:24px;">
                  Bienvenue 👋
                </h2>

                <p style="color:#4b5563; font-size:16px; line-height:1.7;">
                  Merci de t'être inscrit sur <strong>KVault</strong>.
                  Pour activer ton compte et sécuriser ton accès,
                  merci de confirmer ton adresse email.
                </p>

                <!-- Button -->
                <table cellpadding="0" cellspacing="0" style="margin:30px auto;">
                  <tr>
                    <td align="center">
                      <a
                        href="${verificationLink}"
                        style="
                          background:#2563eb;
                          color:white;
                          text-decoration:none;
                          padding:16px 32px;
                          border-radius:10px;
                          display:inline-block;
                          font-size:16px;
                          font-weight:bold;
                        "
                      >
                        Vérifier mon email
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="color:#6b7280; font-size:14px; line-height:1.6;">
                  Si le bouton ne fonctionne pas, copie et colle ce lien
                  dans ton navigateur :
                </p>

                <p style="word-break:break-all;">
                  <a href="${verificationLink}" style="color:#2563eb;">
                    ${verificationLink}
                  </a>
                </p>

                <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0;" />

                <p style="color:#9ca3af; font-size:13px; text-align:center;">
                  Si tu n’as pas créé de compte, tu peux ignorer cet email.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9fafb; padding:20px; text-align:center;">
                <p style="margin:0; color:#9ca3af; font-size:12px;">
                  © ${new Date().getFullYear()} KVault — Tous droits réservés
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  await sendMail(
    email,
    "🔐 Vérifie ton email - KVault",
    `Vérifie ton email ici : ${verificationLink}`,
    html
  );
};