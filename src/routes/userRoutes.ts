import { Router, RequestHandler } from "express";
import { createUser, getUsers, updateUser, deleteUser, getDashboardStats, getUserPlanHistory, acceptTerms, checkTermsAccepted } from "../controllers/userController";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

router.get("/", getUsers);
router.get("/stats", getDashboardStats);
router.get("/:userId/plan-history", getUserPlanHistory);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser as unknown as RequestHandler);

// Rotas de termos (requerem autenticação)
router.post("/terms/accept", authenticateToken, async (req, res) => {
  await acceptTerms(req, res);
});
router.get("/terms/check", authenticateToken, async (req, res) => {
  await checkTermsAccepted(req, res);
});

export default router;
