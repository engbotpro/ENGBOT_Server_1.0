// src/utils/emailSender.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendConfirmationEmail(email: string, token: string) {
  const baseUrl = process.env.BACKEND_URL || process.env.API_URL || process.env.FRONTEND_URL || "http://localhost:5000";
  const url = `${baseUrl}/auth/confirm?token=${encodeURIComponent(token)}`;
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
