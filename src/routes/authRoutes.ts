import { Router, RequestHandler } from "express";
import { login, firstAccess, changePassword, forgotPassword, resetPassword, resetPasswordPage, googleCallback } from "../controllers/authController";
import { register as registerHandler, confirmEmail, resendConfirmationEmail } from "../controllers/userController";
import passport from "passport";

const router = Router();

/* --------- login padrão --------- */
router.post("/login", login);
router.put("/changepassword", firstAccess);
router.put("/changepasswordAlt", changePassword);
router.post("/register", registerHandler as RequestHandler);
router.post("/resend-confirmation", resendConfirmationEmail as RequestHandler);

/* --------- recuperação de senha --------- */
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/reset-password-page", resetPasswordPage);

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
router.get("/google/callback", (req, res, next) => {
  const frontOrigin = process.env.FRONT_ORIGIN || process.env.SERVER_URL || 'http://localhost:5173';
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${frontOrigin}/login?error=auth_failed`,
  }, async (err: any, user: any) => {
    if (err) {
      console.error('❌ Passport Google auth error:', err);
      return res.redirect(`${frontOrigin}/login?error=auth_failed`);
    }
    if (!user) {
      return res.redirect(`${frontOrigin}/login?error=no_user`);
    }
    req.user = user;
    try {
      await googleCallback(req, res);
    } catch (e) {
      console.error('❌ Google callback error:', e);
      res.redirect(`${frontOrigin}/login?error=token_error`);
    }
  })(req, res, next);
});

/* --------- Redirect 302: Auth Tab (v5+) captura e fecha automaticamente --------- */
router.get("/google/mobile-done", (req, res) => {
  const token = req.query.googleToken as string;
  if (!token) {
    res.status(400).send(`<html><body><h2>Erro</h2><p>Token não recebido.</p></body></html>`);
    return;
  }
  res.redirect(302, `engbotmobile://login-callback?googleToken=${encodeURIComponent(token)}`);
});

export default router;
