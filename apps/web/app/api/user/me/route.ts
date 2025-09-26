import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { auth } from "@/utils/auth";

export type UserResponse = Awaited<ReturnType<typeof getUser>> | null;

async function getUser({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      webhookSecret: true,
      referralCode: true,
      premium: {
        select: {
          lemonSqueezyCustomerId: true,
          lemonSqueezySubscriptionId: true,
          lemonSqueezyRenewsAt: true,
          stripeSubscriptionId: true,
          stripeSubscriptionStatus: true,
          unsubscribeCredits: true,
          tier: true,
          emailAccountsAccess: true,
          lemonLicenseKey: true,
          pendingInvites: true,
        },
      },
      emailAccounts: {
        select: {
          id: true,
          members: {
            select: {
              organizationId: true,
              role: true,
              organization: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) throw new SafeError("User not found");

  const members = user.emailAccounts.flatMap((account) =>
    account.members.map((member) => ({
      ...member,
      emailAccountId: account.id,
    })),
  );

  return {
    ...user,
    members,
  };
}

// Intentionally not using withAuth because we want to return null if the user is not authenticated
export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return NextResponse.json(null);

  const user = await getUser({ userId });

  return NextResponse.json(user);
});
