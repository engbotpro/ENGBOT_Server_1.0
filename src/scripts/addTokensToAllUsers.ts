import prisma from "../prismaClient";

async function addTokens() {
  const users = await prisma.userChallengeStats.findMany();
  for (const stats of users) {
    await prisma.userChallengeStats.update({
      where: { userId: stats.userId },
      data: { tokens: { increment: 1000 } },
    });
  }
  console.log(`Added 1000 tokens to ${users.length} users`);
}

addTokens()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
