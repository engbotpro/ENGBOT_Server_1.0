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
  const url = `${process.env.FRONTEND_URL}/confirm?token=${token}`;
  await transporter.sendMail({
    from: `"Seu App" <no-reply@seu-dominio.com>`,
    to: email,
    subject: "Confirme seu cadastro",
    html: `
      <p>Olá!</p>
      <p>Para ativar sua conta, clique no link abaixo:</p>
      <a href="${url}">${url}</a>
      <p>Esse link expira em 24h.</p>
    `,
  });
}
