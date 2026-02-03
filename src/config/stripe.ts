import Stripe from 'stripe';

// Configuração do Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY não configurada. Sistema funcionará em modo mock.');
}

const stripe = stripeSecretKey 
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-06-30.basil',
    })
  : null;

export default stripe; 