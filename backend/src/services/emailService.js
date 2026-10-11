import nodemailer from "nodemailer";

const sentEmails = [];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let emailFetch = (...args) => globalThis.fetch(...args);

function getEmailTimeout() {
  const timeout = Number(process.env.EMAIL_TIMEOUT_MS || 20_000);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new Error("EMAIL_TIMEOUT_MS must be between 1000 and 60000");
  }
  return timeout;
}

function createTestTransporter() {
  return {
    async sendMail(mailOptions) {
      sentEmails.push({
        ...mailOptions,
        sentAt: new Date(),
      });
      return { messageId: `mock-${Date.now()}`, accepted: [mailOptions.to] };
    },
  };
}

function createSmtpTransporter() {
  if (!process.env.SMTP_HOST) {
    throw new Error("SMTP_HOST is required when EMAIL_PROVIDER=smtp");
  }

  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port");
  }
  const socketTimeout = getEmailTimeout();
  if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must both be configured or both omitted");
  }

  const auth = process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    ...(auth ? { auth } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout,
  });
}

function createResendTransporter() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const timeout = getEmailTimeout();
  return {
    async sendMail(mailOptions) {
      let response;
      try {
        response = await emailFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: mailOptions.from,
            to: [mailOptions.to],
            subject: mailOptions.subject,
            text: mailOptions.text,
            html: mailOptions.html,
          }),
          signal: AbortSignal.timeout(timeout),
        });
      } catch (error) {
        if (error?.name === "AbortError" || error?.name === "TimeoutError") {
          throw new Error("Email provider request timed out");
        }
        throw new Error("Email provider request failed");
      }

      if (!response.ok) {
        throw new Error("Email provider rejected the request");
      }

      let result;
      try {
        result = await response.json();
      } catch (error) {
        if (error?.name === "AbortError" || error?.name === "TimeoutError") {
          throw new Error("Email provider request timed out");
        }
        throw new Error("Email provider returned an invalid response");
      }
      if (typeof result?.id !== "string" || !result.id) {
        throw new Error("Email provider returned an invalid response");
      }

      return { messageId: result.id, accepted: [mailOptions.to] };
    },
  };
}

function getTransporter() {
  if (process.env.NODE_ENV === "test") {
    return createTestTransporter();
  }

  switch (process.env.EMAIL_PROVIDER) {
    case "resend":
      return createResendTransporter();
    case "smtp":
      return createSmtpTransporter();
    default:
      throw new Error("EMAIL_PROVIDER must be set to resend or smtp before sending email");
  }
}

async function sendEmail(mailOptions) {
  if (typeof mailOptions.to !== "string" || !EMAIL_PATTERN.test(mailOptions.to.trim())) {
    throw new Error("A valid email recipient is required");
  }
  const from = process.env.EMAIL_FROM
    || (process.env.NODE_ENV === "test" ? "Scion <no-reply@example.test>" : "");
  if (!from || !EMAIL_PATTERN.test(from.replace(/^.*<([^>]+)>.*$/, "$1").trim())) {
    throw new Error("EMAIL_FROM must be configured as a valid sender address");
  }

  if (process.env.NODE_ENV === "production"
    && /\.(?:local|test|example|invalid|localhost)(?:>|$)/i.test(from)) {
    throw new Error("EMAIL_FROM must use a verified sender domain in production");
  }

  const transportOptions = process.env.NODE_ENV === "test"
    ? mailOptions
    : {
      to: mailOptions.to,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
    };
  const result = await getTransporter().sendMail({ ...transportOptions, from });
  const accepted = Array.isArray(result.accepted)
    && result.accepted.some((address) => String(address).toLowerCase() === mailOptions.to.toLowerCase());
  if (!accepted) {
    throw new Error("Email provider did not accept the intended recipient");
  }

  return {
    acceptedByProvider: true,
    messageId: result.messageId,
  };
}

function emailShell(title, body) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#f8fafc;color:#1e293b;font-family:Arial,sans-serif">
    <main style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
      <p style="margin:0 0 20px;color:#2563eb;font-weight:700;letter-spacing:.08em">SCION</p>
      <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
      ${body}
      <p style="border-top:1px solid #e2e8f0;padding-top:16px;margin:24px 0 0;color:#64748b;font-size:12px">If you did not expect this message, you can ignore it.</p>
    </main>
  </body>
</html>`;
}

export async function sendOtpEmail({ to, otp }) {
  const expiresMinutes = 10;
  return sendEmail({
    to,
    otp,
    subject: "Scion Author Invitation Verification Code",
    text: `Use this code to verify the email address for a Scion author invitation: ${otp}\n\nIt expires in ${expiresMinutes} minutes. Enter it in the invitation flow with the person who invited you. If you did not expect this request, ignore this email.`,
    html: emailShell(
      "Verify your email for a Scion author invitation",
      `<p>Use this verification code in the invitation flow with the person who invited you:</p>
       <p style="padding:16px;background:#eff6ff;border-radius:8px;text-align:center;font-size:30px;font-weight:700;letter-spacing:6px;color:#1d4ed8">${otp}</p>
       <p>This code expires in ${expiresMinutes} minutes and can only be used once.</p>`
    ),
  });
}

export async function sendInvitationEmail({ to, invitationUrl, expiresAt }) {
  const expiryText = new Date(expiresAt).toISOString();
  return sendEmail({
    to,
    invitationUrl,
    expiresAt,
    subject: "You are invited to join Scion as an Author",
    text: `You have been invited to join Scion as an Author. Complete your account setup using this link: ${invitationUrl}\n\nThe invitation expires at ${expiryText} (two hours after it was created). If you did not expect this invitation, ignore this email.`,
    html: emailShell(
      "You are invited to Scion",
      `<p>You have been invited to join Scion as an <strong>Author</strong>.</p>
       <p>Use the link below to choose your username and password and complete your account setup. The invitation expires in two hours, at ${expiryText}.</p>
       <p><a href="${invitationUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Accept invitation</a></p>
       <p style="font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br><a href="${invitationUrl}">${invitationUrl}</a></p>`
    ),
  });
}

export async function sendPasswordResetEmail({ to, resetUrl, expiresAt }) {
  const expiryText = new Date(expiresAt).toISOString();
  return sendEmail({
    to,
    resetUrl,
    expiresAt,
    subject: "Reset your Scion password",
    text: `A password reset was requested for your Scion account. Use this link to choose a new password: ${resetUrl}\n\nThe link expires at ${expiryText} and can only be used once. If you did not request a password reset, ignore this email.`,
    html: emailShell(
      "Reset your Scion password",
      `<p>A password reset was requested for your Scion account.</p>
       <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Choose a new password</a></p>
       <p>This link expires at ${expiryText} and can only be used once. If the button does not work, copy this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>`
    ),
  });
}

export function getSentEmails() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Sent email inspection is available only in tests");
  }
  return [...sentEmails];
}

export function clearSentEmails() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Sent email inspection is available only in tests");
  }
  sentEmails.length = 0;
}

export function setEmailFetchForTests(fetchImplementation) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Email provider mocking is available only in tests");
  }
  if (fetchImplementation !== null && typeof fetchImplementation !== "function") {
    throw new TypeError("fetchImplementation must be a function or null");
  }
  emailFetch = fetchImplementation || ((...args) => globalThis.fetch(...args));
}
