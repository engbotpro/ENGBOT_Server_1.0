import crypto from 'crypto';
import prisma from '../prismaClient';

const REFERRAL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_PREMIUM_THRESHOLD = 3;
export const REFERRAL_PREMIUM_PLAN = 'PREMIUM BLACK';

export class ReferralError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ReferralError';
    this.statusCode = statusCode;
  }
}

export function normalizeReferralCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

export function isValidReferralCodeFormat(code: string): boolean {
  return new RegExp(`^[A-Z]{${REFERRAL_CODE_LENGTH}}$`).test(code);
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    let code = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
      code += REFERRAL_LETTERS[crypto.randomInt(0, REFERRAL_LETTERS.length)];
    }

    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }

  throw new Error('Não foi possível gerar código de indicação único');
}

export async function ensureUserReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (!user) {
    throw new ReferralError('Usuário não encontrado', 404);
  }

  if (user.referralCode) {
    return user.referralCode;
  }

  const referralCode = await generateUniqueReferralCode();
  await prisma.user.update({
    where: { id: userId },
    data: { referralCode },
  });

  return referralCode;
}

export async function applyReferralCode(userId: string, rawCode: string) {
  const code = normalizeReferralCode(rawCode);

  if (!isValidReferralCodeFormat(code)) {
    throw new ReferralError(`O código deve conter exatamente ${REFERRAL_CODE_LENGTH} letras.`);
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referredByUserId: true,
        referralCode: true,
      },
    });

    if (!user) {
      throw new ReferralError('Usuário não encontrado', 404);
    }

    if (user.referredByUserId) {
      throw new ReferralError('Você já utilizou um código de indicação.');
    }

    const referrer = await tx.user.findUnique({
      where: { referralCode: code },
      select: { id: true, referralCount: true, isReferralPremium: true },
    });

    if (!referrer) {
      throw new ReferralError('Código de indicação inválido.');
    }

    if (referrer.id === userId) {
      throw new ReferralError('Você não pode usar o seu próprio código.');
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        referredByUserId: referrer.id,
        referralPromptSeen: true,
      },
    });

    const updatedReferrer = await tx.user.update({
      where: { id: referrer.id },
      data: { referralCount: { increment: 1 } },
      select: {
        id: true,
        referralCount: true,
        isReferralPremium: true,
      },
    });

    if (
      updatedReferrer.referralCount >= REFERRAL_PREMIUM_THRESHOLD &&
      !updatedReferrer.isReferralPremium
    ) {
      await tx.user.update({
        where: { id: referrer.id },
        data: {
          isReferralPremium: true,
          currentPlan: REFERRAL_PREMIUM_PLAN,
          planActivatedAt: new Date(),
          planExpiresAt: null,
        },
      });

      await tx.planHistory.create({
        data: {
          userId: referrer.id,
          planName: REFERRAL_PREMIUM_PLAN,
          changeType: 'referral',
          price: 0,
          billingCycle: 'indicacao',
          date: new Date(),
        },
      });
    }

    return {
      referrerId: referrer.id,
      referrerReferralCount: updatedReferrer.referralCount,
      referrerBecamePremium:
        updatedReferrer.referralCount >= REFERRAL_PREMIUM_THRESHOLD &&
        !updatedReferrer.isReferralPremium,
    };
  });
}

export async function getReferralInfo(userId: string) {
  await ensureUserReferralCode(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      referralCount: true,
      referredByUserId: true,
      referralPromptSeen: true,
      isReferralPremium: true,
      currentPlan: true,
      referredBy: {
        select: {
          name: true,
          referralCode: true,
        },
      },
    },
  });

  if (!user) {
    throw new ReferralError('Usuário não encontrado', 404);
  }

  return {
    referralCode: user.referralCode,
    referralCount: user.referralCount,
    referralsUntilPremium: Math.max(0, REFERRAL_PREMIUM_THRESHOLD - user.referralCount),
    referredByUserId: user.referredByUserId,
    referredByName: user.referredBy?.name ?? null,
    referredByCode: user.referredBy?.referralCode ?? null,
    referralPromptSeen: user.referralPromptSeen,
    canApplyReferralCode: !user.referredByUserId,
    isReferralPremium: user.isReferralPremium,
    currentPlan: user.currentPlan,
  };
}

export async function dismissReferralPrompt(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { referralPromptSeen: true },
  });
}
