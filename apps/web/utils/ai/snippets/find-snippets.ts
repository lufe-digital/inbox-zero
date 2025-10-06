import { z } from "zod";
import type { EmailForLLM } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getEmailListPrompt } from "@/utils/ai/helpers";

export async function aiFindSnippets({
  emailAccount,
  sentEmails,
}: {
  emailAccount: EmailAccountWithAI;
  sentEmails: EmailForLLM[];
}) {
  const system = `You are an AI assistant that analyzes email content to find common snippets (canned responses) that the user frequently uses.

<instructions>
1. Analyze the provided email contents
2. Identify recurring responses that appear multiple times across different emails
3. Return only the most meaningful and frequently used snippets
4. Exclude generic phrases like "Best regards" or "Thanks"
5. Generate the text for the snippet from the email content and try to keep it as close to possible to the original text.
6. If no meaningful recurring snippets are found, return an empty array
</instructions>

Return the snippets in the following JSON format:

<example_response>
{
  "snippets": [
    {
      "text": "I've reviewed your proposal and I'm interested in learning more. Could we schedule a call next week to discuss the details? I'm generally available between 2-5pm EST.",
      "count": 8
    },
    {
      "text": "I wanted to follow up on our conversation from last week. Have you had a chance to review the documents I sent over?",
      "count": 15
    },
    {
      "text": "We're currently in the process of evaluating several vendors. I'll be sure to include your proposal in our review and will get back to you with our decision by the end of next week.",
      "count": 4
    }
  ]
}
</example_response>`;

  const prompt = `Here are the emails to analyze:

${getEmailListPrompt({ messages: sentEmails, messageMaxLength: 2000 })}`;

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "ai-find-snippets",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      snippets: z.array(
        z.object({
          text: z.string(),
          count: z.number(),
        }),
      ),
    }),
  });

  return aiResponse.object;
}
