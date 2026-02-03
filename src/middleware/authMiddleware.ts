import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.header("Authorization");
  const token = authHeader?.split(" ")[1];

  // Se não houver token, envie a resposta e finalize a função
  if (!token) {
    res.status(401).json({ error: "Acesso negado. Token não fornecido." });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; perfil: string; name: string };
    req.user = decoded;
    next();
    return; 
  } catch (error: any) {
    // Se for erro de expiração, retornar 401 para indicar que precisa reautenticar
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: "Token expirado. Faça login novamente." });
      return;
    }
    res.status(403).json({ error: "Token inválido ou expirado." });
    return;
  }
};
