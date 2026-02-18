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

/* --------- Página intermediária para mobile (fecha o Custom Tab e passa token ao app) --------- */
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
  const deepLink = `engbotmobile://login-callback?googleToken=${encodeURIComponent(token)}`;
  const escapedDeepLink = deepLink.replace(/"/g, "&quot;").replace(/</g, "\\u003c");
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
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a1419; color: #fff; padding: 20px; text-align: center; }
    h2 { color: #39ff14; }
    p { opacity: 0.9; }
    a { display: inline-block; margin-top: 16px; padding: 14px 28px; background: #39ff14; color: #000; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
  </style>
</head>
<body>
  <h2>Login realizado com sucesso!</h2>
  <p>Retornando ao app...</p>
  <p style="font-size:12px;opacity:0.6;">Se a janela não fechar automaticamente, toque no botão abaixo.</p>
  <a href="${escapedDeepLink}" id="backBtn">Retornar ao app</a>
  <script>
    (function() {
      var dl = ${JSON.stringify(deepLink)};
      setTimeout(function() {
        window.location.href = dl;
      }, 500);
    })();
  </script>
</body>
</html>
  `);
});

export default router;
