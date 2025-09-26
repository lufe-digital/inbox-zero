import { env } from "@/env";
import { PremiumTier } from "@prisma/client";

type Feature = { text: string; tooltip?: string };

export type Tier = {
  name: string;
  tiers: { monthly: PremiumTier; annually: PremiumTier };
  price: { monthly: number; annually: number };
  discount: { monthly: number; annually: number };
  quantity?: number;
  description: string;
  features: Feature[];
  cta: string;
  ctaLink?: string;
  mostPopular?: boolean;
};

const pricing: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 16,
  [PremiumTier.BASIC_ANNUALLY]: 8,
  [PremiumTier.PRO_MONTHLY]: 16,
  [PremiumTier.PRO_ANNUALLY]: 10,
  [PremiumTier.BUSINESS_MONTHLY]: 20,
  [PremiumTier.BUSINESS_ANNUALLY]: 18,
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: 50,
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: 42,
  [PremiumTier.COPILOT_MONTHLY]: 500,
  [PremiumTier.LIFETIME]: 299,
};

const variantIdToTier: Record<number, PremiumTier> = {
  [env.NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID]: PremiumTier.BASIC_MONTHLY,
  [env.NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID]: PremiumTier.BASIC_ANNUALLY,
  [env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID]: PremiumTier.PRO_MONTHLY,
  [env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID]: PremiumTier.PRO_ANNUALLY,
  [env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID]: PremiumTier.BUSINESS_MONTHLY,
  [env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID]: PremiumTier.BUSINESS_ANNUALLY,
  [env.NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID]: PremiumTier.COPILOT_MONTHLY,
};

const STRIPE_PRICE_ID_CONFIG: Record<
  PremiumTier,
  {
    // active price id
    priceId?: string;
    // Allow handling of old price ids
    oldPriceIds?: string[];
  }
> = {
  [PremiumTier.BASIC_MONTHLY]: { priceId: "price_1RfeDLKGf8mwZWHn6UW8wJcY" },
  [PremiumTier.BASIC_ANNUALLY]: { priceId: "price_1RfeDLKGf8mwZWHn5kfC8gcM" },
  [PremiumTier.PRO_MONTHLY]: {},
  [PremiumTier.PRO_ANNUALLY]: {},
  [PremiumTier.BUSINESS_MONTHLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u73KGf8mwZWHn8VYFdALA",
      "price_1RMSnIKGf8mwZWHnlHP0212n",
      "price_1RfoILKGf8mwZWHnDiUMj6no",
      "price_1RfeAFKGf8mwZWHnnnPzFEky",
      "price_1RfSoHKGf8mwZWHnxTsSDTqW",
      "price_1Rg0QfKGf8mwZWHnDsiocBVD",
      "price_1Rg0LEKGf8mwZWHndYXYg7ie",
      "price_1Rg03pKGf8mwZWHnWMNeQzLc",
    ],
  },
  [PremiumTier.BUSINESS_ANNUALLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u6uKGf8mwZWHnEvPWuQzG",
      "price_1S1QGGKGf8mwZWHnYpUcqNua",
      "price_1RMSnIKGf8mwZWHnymtuW2s0",
      "price_1RfSoxKGf8mwZWHngHcug4YM",
    ],
  },
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u6NKGf8mwZWHnZCfy4D5n",
      "price_1RMSoMKGf8mwZWHn5fAKBT19",
    ],
  },
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u6XKGf8mwZWHnba8HX1H2",
      "price_1RMSoMKGf8mwZWHnGjf6fRmh",
    ],
  },
  [PremiumTier.COPILOT_MONTHLY]: {},
  [PremiumTier.LIFETIME]: {},
};

export function getStripeSubscriptionTier({
  priceId,
}: {
  priceId: string;
}): PremiumTier | null {
  const entries = Object.entries(STRIPE_PRICE_ID_CONFIG);

  for (const [tier, config] of entries) {
    if (config.priceId === priceId || config.oldPriceIds?.includes(priceId)) {
      return tier as PremiumTier;
    }
  }
  return null;
}

export function getStripePriceId({
  tier,
}: {
  tier: PremiumTier;
}): string | null {
  return STRIPE_PRICE_ID_CONFIG[tier]?.priceId ?? null;
}

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

export const businessTierName = "Starter";

const businessTier: Tier = {
  name: businessTierName,
  tiers: {
    monthly: PremiumTier.BUSINESS_MONTHLY,
    annually: PremiumTier.BUSINESS_ANNUALLY,
  },
  price: {
    monthly: pricing.BUSINESS_MONTHLY,
    annually: pricing.BUSINESS_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(pricing.BUSINESS_MONTHLY, pricing.BUSINESS_ANNUALLY),
  },
  description:
    "For individuals, entrepreneurs, and executives looking to buy back their time.",
  features: [
    {
      text: "Sorts and labels every email",
    },
    {
      text: "Drafts replies in your voice",
    },
    {
      text: "Blocks cold emails",
    },
    {
      text: "Bulk unsubscribe and archive emails",
    },
    {
      text: "Email analytics",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: true,
};

const businessPlusTier: Tier = {
  name: "Professional",
  tiers: {
    monthly: PremiumTier.BUSINESS_PLUS_MONTHLY,
    annually: PremiumTier.BUSINESS_PLUS_ANNUALLY,
  },
  price: {
    monthly: pricing.BUSINESS_PLUS_MONTHLY,
    annually: pricing.BUSINESS_PLUS_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(
      pricing.BUSINESS_PLUS_MONTHLY,
      pricing.BUSINESS_PLUS_ANNUALLY,
    ),
  },
  description: "For teams and growing businesses handling high email volumes.",
  features: [
    {
      text: "Everything in Individual, plus:",
    },
    {
      text: "Unlimited knowledge base",
      tooltip:
        "The knowledge base is used to help draft responses. Store up to unlimited content in your knowledge base.",
    },
    { text: "Team-wide analytics" },
    { text: "Priority support" },
    {
      text: "Dedicated onboarding manager",
      tooltip:
        "We'll help you get set up on an onboarding call. Book as many free calls as needed.",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: false,
};

const enterpriseTier: Tier = {
  name: "Enterprise",
  tiers: {
    monthly: PremiumTier.COPILOT_MONTHLY,
    annually: PremiumTier.COPILOT_MONTHLY,
  },
  price: { monthly: 0, annually: 0 },
  discount: { monthly: 0, annually: 0 },
  description:
    "For organizations with enterprise-grade security and compliance requirements.",
  features: [
    {
      text: "Everything in Team, plus:",
    },
    {
      text: "SSO login",
    },
    {
      text: "On-premise deployment (optional)",
    },
    {
      text: "Advanced security & SLA",
    },
    {
      text: "Dedicated account manager & training",
    },
  ],
  cta: "Speak to sales",
  ctaLink: "https://go.getinboxzero.com/sales",
  mostPopular: false,
};

export function getLemonSubscriptionTier({
  variantId,
}: {
  variantId: number;
}): PremiumTier {
  const tier = variantIdToTier[variantId];
  if (!tier) throw new Error(`Unknown variant id: ${variantId}`);
  return tier;
}

export const tiers: Tier[] = [businessTier, businessPlusTier, enterpriseTier];
