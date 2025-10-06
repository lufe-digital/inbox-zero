import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import { getUserInfoPrompt, getUserRulesPrompt } from "@/utils/ai/helpers";
// import { Braintrust } from "@/utils/braintrust";
// const braintrust = new Braintrust("choose-rule-2");

const logger = createScopedLogger("AI Choose Rule");

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string }[];
  modelType?: ModelType;
};

async function getAiResponse(options: GetAiResponseOptions) {
  const { email, emailAccount, rules, modelType = "default" } = options;

  const emailSection = stringifyEmail(email, 500);

  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting a rule:

  <priority>
  1. Match the email to a SPECIFIC user-defined rule that addresses the email's exact content or purpose.
  2. If the email doesn't match any specific rule but the user has a catch-all rule (like "emails that don't match other criteria"), use that catch-all rule.
  3. Only set "noMatchFound" to true if no user-defined rule can reasonably apply.
  4. Be concise in your reasoning - avoid repetitive explanations.
  5. Provide only the exact rule name from the list below.
  </priority>

  <guidelines>
  - If a rule says to exclude certain types of emails, DO NOT select that rule for those excluded emails.
  - When multiple rules match, choose the more specific one that best matches the email's content.
  - Rules about requiring replies should be prioritized when the email clearly needs a response.
  </guidelines>
</instructions>

${getUserRulesPrompt({ rules })}

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format:
{
  "reason": "This email is a newsletter subscription",
  "ruleName": "Newsletter",
  "noMatchFound": false
}`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${emailSection}
</email>`;

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Choose rule",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      reason: z
        .string()
        .describe("The reason you chose the rule. Keep it concise"),
      ruleName: z
        .string()
        .describe("The exact name of the rule you want to apply"),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
    }),
  });

  // braintrust.insertToDataset({
  //   id: email.id,
  //   input: {
  //     email: emailSection,
  //     rules: rules.map((rule) => ({
  //       name: rule.name,
  //       instructions: rule.instructions,
  //     })),
  //     hasAbout: !!emailAccount.about,
  //     userAbout: emailAccount.about,
  //     userEmail: emailAccount.email,
  //   },
  //   expected: aiResponse.object.ruleName,
  // });

  return { result: aiResponse.object, modelOptions };
}

export async function aiChooseRule<
  T extends { name: string; instructions: string },
>({
  email,
  rules,
  emailAccount,
  modelType,
}: {
  email: EmailForLLM;
  rules: T[];
  emailAccount: EmailAccountWithAI;
  modelType?: ModelType;
}) {
  if (!rules.length) return { reason: "No rules" };

  const { result: aiResponse, modelOptions } = await getAiResponse({
    email,
    rules,
    emailAccount,
    modelType,
  });

  if (aiResponse.noMatchFound)
    return { rule: undefined, reason: "No match found" };

  const selectedRule = aiResponse.ruleName
    ? rules.find(
        (rule) =>
          rule.name.toLowerCase() === aiResponse.ruleName?.toLowerCase(),
      )
    : undefined;

  // The AI found a match, but didn't select a rule
  // We should probably force a retry in this case
  if (aiResponse.ruleName && !selectedRule) {
    logger.error("No matching rule found", {
      noMatchFound: aiResponse.noMatchFound,
      reason: aiResponse.reason,
      ruleName: aiResponse.ruleName,
      rules: rules.map((r) => ({
        name: r.name,
        instructions: r.instructions,
      })),
      emailId: email.id,
      model: modelOptions.modelName,
      provider: modelOptions.provider,
      providerOptions: modelOptions.providerOptions,
      modelType,
    });
  }

  return {
    rule: selectedRule,
    reason: aiResponse?.reason,
  };
}
