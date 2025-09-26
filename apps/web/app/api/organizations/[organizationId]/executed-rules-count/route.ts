import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";

export type GetExecutedRulesCountResponse = Awaited<
  ReturnType<typeof getExecutedRulesCount>
>;

export const GET = withAuth(async (request, { params }) => {
  const { userId } = request.auth;
  const { organizationId } = await params;

  await fetchAndCheckIsAdmin({ organizationId, userId });

  const result = await getExecutedRulesCount({ organizationId });

  return NextResponse.json(result);
});

async function getExecutedRulesCount({
  organizationId,
}: {
  organizationId: string;
}) {
  const memberCounts = await prisma.executedRule.groupBy({
    by: ["emailAccountId"],
    where: {
      emailAccount: {
        members: {
          some: {
            organizationId,
          },
        },
      },
    },
    _count: {
      id: true,
    },
  });

  const result = memberCounts.map(({ emailAccountId, _count }) => ({
    emailAccountId,
    executedRulesCount: _count.id,
  }));

  return { memberCounts: result };
}
