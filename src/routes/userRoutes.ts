import { Router, RequestHandler } from "express";
import { createUser, getUsers, updateUser, deleteUser, getDashboardStats, getUserPlanHistory, acceptTerms, checkTermsAccepted, getReferralInfo, applyReferralCodeHandler, dismissReferralPromptHandler } from "../controllers/userController";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

router.get("/", getUsers);
router.get("/stats", getDashboardStats);

// Rotas de indicação (requerem autenticação) — antes das rotas com :userId
router.get("/referral/me", authenticateToken, async (req, res) => {
  await getReferralInfo(req, res);
});
router.post("/referral/apply", authenticateToken, async (req, res) => {
  await applyReferralCodeHandler(req, res);
});
router.post("/referral/dismiss-prompt", authenticateToken, async (req, res) => {
  await dismissReferralPromptHandler(req, res);
});

router.get("/:userId/plan-history", getUserPlanHistory);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser as RequestHandler);

// Rotas de termos (requerem autenticação)
router.post("/terms/accept", authenticateToken, async (req, res) => {
  await acceptTerms(req, res);
});
router.get("/terms/check", authenticateToken, async (req, res) => {
  await checkTermsAccepted(req, res);
});

export default router;
