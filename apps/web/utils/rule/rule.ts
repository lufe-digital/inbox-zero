import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createScopedLogger } from "@/utils/logger";
import { ActionType } from "@prisma/client";
import type { Prisma, Rule, SystemType } from "@prisma/client";
import { getUserCategoriesForNames } from "@/utils/category.server";
import { getActionRiskLevel, type RiskAction } from "@/utils/risk";
import { hasExampleParams } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { SafeError } from "@/utils/error";
import { createRuleHistory } from "@/utils/rule/rule-history";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";

const logger = createScopedLogger("rule");

export function partialUpdateRule({
  ruleId,
  data,
}: {
  ruleId: string;
  data: Partial<Rule>;
}) {
  return prisma.rule.update({
    where: { id: ruleId },
    data,
    include: { actions: true, categoryFilters: true, group: true },
  });
}

// Extended type for system rules that can include labelId and folderId
type CreateRuleWithLabelId = Omit<
  CreateOrUpdateRuleSchemaWithCategories,
  "actions"
> & {
  actions: (CreateOrUpdateRuleSchemaWithCategories["actions"][number] & {
    labelId?: string | null;
    folderId?: string | null;
  })[];
};

export async function safeCreateRule({
  result,
  emailAccountId,
  provider,
  categoryNames,
  systemType,
  triggerType = "ai_creation",
  shouldCreateIfDuplicate,
  runOnThreads,
}: {
  result: CreateRuleWithLabelId;
  emailAccountId: string;
  provider: string;
  categoryNames?: string[] | null;
  systemType?: SystemType | null;
  triggerType?: "ai_creation" | "manual_creation" | "system_creation";
  shouldCreateIfDuplicate: boolean; // maybe this should just always be false?
  runOnThreads: boolean;
}) {
  const categoryIds = await getUserCategoriesForNames({
    emailAccountId,
    names: categoryNames || [],
  });

  try {
    const rule = await createRule({
      result,
      emailAccountId,
      categoryIds,
      systemType,
      triggerType,
      provider,
      runOnThreads,
    });
    return rule;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      if (shouldCreateIfDuplicate) {
        // if rule name already exists, create a new rule with a unique name
        const rule = await createRule({
          result: { ...result, name: `${result.name} - ${Date.now()}` },
          emailAccountId,
          categoryIds,
          triggerType,
          provider,
          runOnThreads,
        });
        return rule;
      } else {
        // Check if there's an existing rule with this name
        const existingRule = await prisma.rule.findUnique({
          where: {
            name_emailAccountId: {
              emailAccountId,
              name: result.name,
            },
          },
          include: { actions: true, categoryFilters: true, group: true },
        });

        // If we're creating a system rule and the existing rule doesn't have
        // the same systemType, create the system rule with a unique name
        // to avoid breaking system functionality
        if (systemType && existingRule?.systemType !== systemType) {
          logger.info("Creating system rule with unique name due to conflict", {
            systemType,
            existingRuleName: result.name,
            existingRuleSystemType: existingRule?.systemType,
          });
          const rule = await createRule({
            result: { ...result, name: `${result.name} - ${Date.now()}` },
            emailAccountId,
            categoryIds,
            systemType,
            triggerType,
            provider,
            runOnThreads,
          });
          return rule;
        }

        return existingRule;
      }
    }

    logger.error("Error creating rule", {
      emailAccountId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });
    // return { error: "Error creating rule." };
  }
}

export async function safeUpdateRule({
  ruleId,
  result,
  emailAccountId,
  categoryIds,
  triggerType = "ai_update",
  provider,
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryIds?: string[] | null;
  triggerType?: "ai_update" | "manual_update" | "system_update";
  provider: string;
}) {
  try {
    const rule = await updateRule({
      ruleId,
      result,
      emailAccountId,
      categoryIds,
      triggerType,
      provider,
    });
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule({
        result: { ...result, name: `${result.name} - ${Date.now()}` },
        emailAccountId,
        categoryIds,
        triggerType: "ai_creation", // Default for safeUpdateRule fallback
        provider,
        runOnThreads: true,
      });
      return { id: rule.id };
    }

    logger.error("Error updating rule", {
      emailAccountId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error updating rule." };
  }
}

export async function createRule({
  result,
  emailAccountId,
  categoryIds,
  systemType,
  triggerType = "ai_creation",
  provider,
  runOnThreads,
}: {
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryIds?: string[] | null;
  systemType?: SystemType | null;
  triggerType?: "ai_creation" | "manual_creation" | "system_creation";
  provider: string;
  runOnThreads: boolean;
}) {
  const mappedActions = await mapActionFields(
    result.actions,
    provider,
    emailAccountId,
  );

  const rule = await prisma.rule.create({
    data: {
      name: result.name,
      emailAccountId,
      systemType,
      actions: { createMany: { data: mappedActions } },
      enabled: shouldEnable(
        result,
        mappedActions.map((a) => ({
          type: a.type,
          subject: a.subject ?? null,
          content: a.content ?? null,
          to: a.to ?? null,
          cc: a.cc ?? null,
          bcc: a.bcc ?? null,
        })),
      ),
      runOnThreads,
      conditionalOperator: result.condition.conditionalOperator ?? undefined,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
      categoryFilterType: result.condition.categories?.categoryFilterType,
      categoryFilters: categoryIds
        ? {
            connect: categoryIds.map((id) => ({
              id,
            })),
          }
        : undefined,
    },
    include: { actions: true, categoryFilters: true, group: true },
  });

  // Track rule creation in history
  await createRuleHistory({ rule, triggerType });

  return rule;
}

async function updateRule({
  ruleId,
  result,
  emailAccountId,
  categoryIds,
  triggerType = "ai_update",
  provider,
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryIds?: string[] | null;
  triggerType?: "ai_update" | "manual_update" | "system_update";
  provider: string;
}) {
  const rule = await prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: result.name,
      emailAccountId,
      // NOTE: this is safe for now as `Action` doesn't have relations
      // but if we add relations to `Action`, we would need to `update` here instead of `deleteMany` and `createMany` to avoid cascading deletes
      actions: {
        deleteMany: {},
        createMany: {
          data: await mapActionFields(result.actions, provider, emailAccountId),
        },
      },
      conditionalOperator: result.condition.conditionalOperator ?? undefined,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
      categoryFilterType: result.condition.categories?.categoryFilterType,
      categoryFilters: categoryIds
        ? {
            set: categoryIds.map((id) => ({
              id,
            })),
          }
        : undefined,
    },
    include: { actions: true, categoryFilters: true, group: true },
  });

  // Track rule update in history
  await createRuleHistory({ rule, triggerType });

  return rule;
}

export async function updateRuleActions({
  ruleId,
  actions,
  provider,
  emailAccountId,
}: {
  ruleId: string;
  actions: CreateOrUpdateRuleSchemaWithCategories["actions"];
  provider: string;
  emailAccountId: string;
}) {
  return prisma.rule.update({
    where: { id: ruleId },
    data: {
      actions: {
        deleteMany: {},
        createMany: {
          data: await mapActionFields(actions, provider, emailAccountId),
        },
      },
    },
  });
}

export async function deleteRule({
  emailAccountId,
  ruleId,
  groupId,
}: {
  emailAccountId: string;
  ruleId: string;
  groupId?: string | null;
}) {
  return Promise.all([
    prisma.rule.delete({ where: { id: ruleId, emailAccountId } }),
    // in the future, we can make this a cascade delete, but we need to change the schema for this to happen
    groupId
      ? prisma.group.delete({ where: { id: groupId, emailAccountId } })
      : null,
  ]);
}

function shouldEnable(
  rule: CreateOrUpdateRuleSchemaWithCategories,
  actions: RiskAction[],
) {
  // Don't automate if it's an example rule that should have been edited by the user
  if (
    hasExampleParams({
      condition: rule.condition,
      actions: rule.actions.map((a) => ({ content: a.fields?.content })),
    })
  )
    return false;

  // Don't automate sending or replying to emails
  if (
    rule.actions.find(
      (a) => a.type === ActionType.REPLY || a.type === ActionType.SEND_EMAIL,
    )
  )
    return false;

  const riskLevels = actions.map(
    (action) => getActionRiskLevel(action, {}).level,
  );
  // Only enable if all actions are low risk
  return riskLevels.every((level) => level === "low");
}

export async function addRuleCategories(ruleId: string, categoryIds: string[]) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { categoryFilters: true },
  });

  if (!rule) throw new SafeError("Rule not found");

  const existingIds = rule.categoryFilters.map((c) => c.id) || [];
  const newIds = [...new Set([...existingIds, ...categoryIds])];

  return prisma.rule.update({
    where: { id: ruleId },
    data: { categoryFilters: { set: newIds.map((id) => ({ id })) } },
    include: { actions: true, categoryFilters: true, group: true },
  });
}

export async function removeRuleCategories(
  ruleId: string,
  categoryIds: string[],
) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { categoryFilters: true },
  });

  if (!rule) throw new SafeError("Rule not found");

  const existingIds = rule.categoryFilters.map((c) => c.id) || [];
  const newIds = existingIds.filter((id) => !categoryIds.includes(id));

  return prisma.rule.update({
    where: { id: ruleId },
    data: { categoryFilters: { set: newIds.map((id) => ({ id })) } },
    include: { actions: true, categoryFilters: true, group: true },
  });
}

async function mapActionFields(
  actions: (CreateOrUpdateRuleSchemaWithCategories["actions"][number] & {
    labelId?: string | null;
    folderId?: string | null;
  })[],
  provider: string,
  emailAccountId: string,
) {
  const actionPromises = actions.map(
    async (a): Promise<Prisma.ActionCreateManyRuleInput> => {
      let label = a.fields?.label;
      let labelId: string | null = null;
      const folderName =
        typeof a.fields?.folderName === "string" ? a.fields.folderName : null;
      let folderId: string | null = a.folderId || null;

      if (a.type === ActionType.LABEL) {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
        });

        const resolved = await resolveLabelNameAndId({
          emailProvider,
          label: a.fields?.label || null,
          labelId: a.labelId || null,
        });
        label = resolved.label;
        labelId = resolved.labelId;
      }

      if (
        a.type === ActionType.MOVE_FOLDER &&
        folderName &&
        !folderId &&
        isMicrosoftProvider(provider)
      ) {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
        });

        folderId =
          await emailProvider.getOrCreateOutlookFolderIdByName(folderName);
      }

      return {
        type: a.type,
        label,
        labelId,
        to: a.fields?.to,
        cc: a.fields?.cc,
        bcc: a.fields?.bcc,
        subject: a.fields?.subject,
        content: a.fields?.content,
        url: a.fields?.webhookUrl,
        ...(isMicrosoftProvider(provider) && {
          folderName: folderName ?? null,
          folderId,
        }),
        delayInMinutes: a.delayInMinutes,
      };
    },
  );

  return Promise.all(actionPromises);
}
