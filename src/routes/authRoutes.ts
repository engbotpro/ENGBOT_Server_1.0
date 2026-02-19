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
