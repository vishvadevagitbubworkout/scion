import nodemailer from "nodemailer";

const sentEmails = [];

/**
 * Returns a configured nodemailer transporter.
 */
function createTransporter() {
  const isTest = process.env.NODE_ENV === "test";
  const hasSmtp = Boolean(process.env.SMTP_HOST);

  if (isTest || !hasSmtp) {
    // Development / test stream or mock transporter
    return {
      async sendMail(mailOptions) {
        sentEmails.push({
          ...mailOptions,
          sentAt: new Date(),
        });
        return { messageId: `mock-${Date.now()}` };
      },
    };
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

const transporter = createTransporter();

/**
 * Sends a 6-digit verification OTP email to the invitee.
 * @param {{ to: string, otp: string }} params
 */
export async function sendOtpEmail({ to, otp }) {
  const from = process.env.EMAIL_FROM || "no-reply@scion.local";
  const mailOptions = {
    from,
    to,
    otp,
    subject: "SCION Author Invitation - Verification OTP",
    text: `Your SCION Author Invitation verification OTP code is: ${otp}\n\nThis OTP will expire in 10 minutes. Please provide this code to your inviter to proceed with your invitation.`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; borderRadius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">SCION Author Verification</h2>
        <p style="color: #475569;">You have been nominated for an Author account on SCION. Your 6-digit verification code is:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2563eb; background: #eff6ff; padding: 12px; text-align: center; border-radius: 6px; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #64748b; font-size: 13px;">This code will expire in 10 minutes. Please share this with your inviter to verify your email address.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

/**
 * Sends an invitation link email to the invitee.
 * @param {{ to: string, invitationUrl: string, expiresAt: Date }} params
 */
export async function sendInvitationEmail({ to, invitationUrl, expiresAt }) {
  const from = process.env.EMAIL_FROM || "no-reply@scion.local";
  const expiryTimeFormatted = new Date(expiresAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const mailOptions = {
    from,
    to,
    invitationUrl,
    expiresAt,
    subject: "You are invited to join SCION as an Author",
    text: `You have been invited to join SCION as an Author.\n\nClick the link below to create your account:\n${invitationUrl}\n\nIMPORTANT: This invitation expires in exactly 2 hours (at approximately ${expiryTimeFormatted}). After expiration, this link cannot be used and a new invitation will be required.`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; borderRadius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to SCION</h2>
        <p style="color: #334155; font-size: 15px;">You have been invited to join SCION as an <strong>Author</strong>.</p>
        <p style="color: #475569; font-size: 14px;">Click the button below to complete your account setup and choose your username and password:</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${invitationUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
            Create Your Author Account
          </a>
        </div>
        <p style="color: #b91c1c; font-size: 13px; font-weight: 600;">
          ⚠️ This invitation expires in exactly 2 hours (around ${expiryTimeFormatted}).
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          If the button does not work, copy and paste this link into your browser:<br/>
          <a href="${invitationUrl}" style="color: #2563eb; word-break: break-all;">${invitationUrl}</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

/**
 * Test helper to inspect sent emails in mock/test mode.
 */
export function getSentEmails() {
  return [...sentEmails];
}

/**
 * Test helper to clear sent emails history.
 */
export function clearSentEmails() {
  sentEmails.length = 0;
}
