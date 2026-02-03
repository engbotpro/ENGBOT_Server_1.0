import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { id: string } | string; // Adiciona o campo `user` à interface Request com id
    }
  }
}
