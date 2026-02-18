import { Router, RequestHandler } from "express";
import { login, firstAccess, changePassword, googleCallback } from "../controllers/authController";
import { register as registerHandler, confirmEmail, resendConfirmationEmail } from "../controllers/userController";
import passport from "passport";

const router = Router();

/* --------- login padrão --------- */
router.post("/login", login);
router.put("/changepassword", firstAccess);
router.put("/changepasswordAlt", changePassword);
router.post("/register", registerHandler as RequestHandler);
router.post("/resend-confirmation", resendConfirmationEmail as RequestHandler);

/* --------- confirmação de e-mail (link do e-mail) --------- */
router.get("/confirm", async (req, res) => {
  await confirmEmail(req, res);
});

/* --------- OAuth Google --------- */
router.get(
  "/google",
  (req, res, next) => {
    // Captura o parâmetro mobile para passar via state
    const isMobile = req.query.mobile === 'true';
    const state = isMobile ? 'mobile' : 'web';
    
    passport.authenticate("google", { 
      scope: ["profile", "email"],
      state: state
    })(req, res, next);
  }
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONT_ORIGIN}/login`,
  }),
  googleCallback
);

/* --------- Página intermediária para mobile (Custom Tab → app via deep link) --------- */
router.get("/google/mobile-done", (req, res) => {
  const token = req.query.googleToken as string;
  if (!token) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:20px;text-align:center;">
        <h2>Erro</h2>
        <p>Token não recebido. Tente fazer login novamente.</p>
      </body></html>
    `);
    return;
  }
  // Intent URL: formato que o Android trata melhor ao abrir app a partir do navegador
  const intentUrl = `intent://login-callback?googleToken=${encodeURIComponent(token)}#Intent;scheme=engbotmobile;package=com.engbot.app;end`;
  const escapedIntentUrl = intentUrl.replace(/"/g, "&quot;").replace(/</g, "\\u003c");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Login realizado</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0a1419; color: #fff; padding: 24px; text-align: center; }
    a { display: block; width: 100%; height: 100%; position: fixed; top: 0; left: 0; text-decoration: none; color: inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    h2 { color: #39ff14; margin: 0 0 12px 0; }
    p { opacity: 0.9; margin: 8px 0; }
    .btn { display: inline-block; margin-top: 24px; padding: 16px 32px; background: #39ff14; color: #000; border-radius: 8px; font-weight: 600; font-size: 18px; position: relative; z-index: 1; }
  </style>
</head>
<body>
  <a href="${escapedIntentUrl}" id="openApp">
    <h2>Login realizado com sucesso!</h2>
    <p>Toque em qualquer lugar para abrir o aplicativo</p>
    <span class="btn">Abrir EngBot</span>
  </a>
</body>
</html>
  `);
});

export default router;
