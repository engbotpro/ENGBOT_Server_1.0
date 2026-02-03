# EngBot Server - Dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json ./

# Instalar todas as dependências (incluindo dev para build)
RUN npm ci

# Copiar código fonte e schema Prisma
COPY . .

# Gerar Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Variáveis para produção
ENV NODE_ENV=production

# Copiar package.json e package-lock.json
COPY package.json package-lock.json ./

# Instalar apenas dependências de produção
RUN npm ci --omit=dev

# Copiar Prisma schema e migrations
COPY prisma ./prisma/

# Gerar Prisma Client
RUN npx prisma generate

# Copiar build da aplicação
COPY --from=builder /app/dist ./dist

# Usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 5000

# Script de entrada: migração + start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
