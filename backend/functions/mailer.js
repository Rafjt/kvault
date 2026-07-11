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
  const verificationLink = `https://kvault.local/auth/verify-email?token=${verificationToken}`;

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email Verification</title>
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
                  Verify your email address
                </p>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin-top:0; color:#111827; font-size:24px;">
                  Welcome 👋
                </h2>

                <p style="color:#4b5563; font-size:16px; line-height:1.7;">
                  Thank you for registering with <strong>KVault</strong>.
                  To activate your account and secure your access,
                  please verify your email address.
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
                        Verify my email
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="color:#6b7280; font-size:14px; line-height:1.6;">
                  If the button doesn't work, copy and paste this link
                  into your browser:
                </p>

                <p style="word-break:break-all;">
                  <a href="${verificationLink}" style="color:#2563eb;">
                    ${verificationLink}
                  </a>
                </p>

                <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0;" />

                <p style="color:#9ca3af; font-size:13px; text-align:center;">
                  If you did not create an account, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9fafb; padding:20px; text-align:center;">
                <p style="margin:0; color:#9ca3af; font-size:12px;">
                  © ${new Date().getFullYear()} KVault — All rights reserved.
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
    "🔐 Verify your email - KVault",
    `Verify your email here : ${verificationLink}`,
    html,
  );
};
