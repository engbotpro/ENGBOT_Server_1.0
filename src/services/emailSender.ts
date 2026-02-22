// src/utils/emailSender.ts
import nodemailer from "nodemailer";

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT) || 587,
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  secure: false,
});

export async function sendConfirmationEmail(email: string, token: string, baseUrlOverride?: string) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env");
  }
  const baseUrl = baseUrlOverride ||
    process.env.BACKEND_URL ||
    process.env.SERVER_URL ||
    process.env.API_URL ||
    process.env.FRONTEND_URL ||
    process.env.FRONT_ORIGIN ||
    "https://engbot-server-1-0-546289259263.southamerica-east1.run.app"; // fallback produção
  const url = `${baseUrl.replace(/\/$/, "")}/auth/confirm?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"EngBot" <no-reply@engbot.com>`,
    to: email,
    subject: "Confirme seu cadastro - EngBot",
    html: `
      <p>Olá!</p>
      <p>Para ativar sua conta no EngBot, clique no link abaixo:</p>
      <p><a href="${url}" style="color:#39FF14;">Confirmar meu cadastro</a></p>
      <p>Ou copie e cole no navegador:</p>
      <p style="word-break:break-all;">${url}</p>
      <p>Esse link expira em 24 horas.</p>
    `,
  });
}

/** E-mail de recuperação de senha: link e código para usar no app */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrlOverride?: string
) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env");
  }
  const baseUrl =
    baseUrlOverride ||
    process.env.BACKEND_URL ||
    process.env.SERVER_URL ||
    process.env.FRONT_ORIGIN ||
    "https://engbot-server-1-0-546289259263.southamerica-east1.run.app";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/auth/reset-password-page?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"EngBot" <no-reply@engbot.com>`,
    to: email,
    subject: "Recuperação de senha - EngBot",
    html: `
      <p>Olá!</p>
      <p>Você solicitou a redefinição de senha. Use uma das opções abaixo:</p>
      <p><strong>Opção 1:</strong> <a href="${resetUrl}" style="color:#39FF14;">Clique aqui para redefinir sua senha</a></p>
      <p><strong>Opção 2:</strong> No app, vá em "Redefinir senha" e informe este código:</p>
      <p style="font-size:18px;letter-spacing:4px;font-family:monospace;">${token}</p>
      <p>Este link/código expira em 1 hora.</p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    `,
  });
}
