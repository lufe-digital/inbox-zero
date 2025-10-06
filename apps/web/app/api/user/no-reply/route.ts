import { NextResponse } from "next/server";
import { isDefined } from "@/utils/types";
import { withEmailProvider } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";

export type NoReplyResponse = Awaited<ReturnType<typeof getNoReply>>;

async function getNoReply({
  emailAccountId,
  userEmail,
  provider,
}: {
  emailAccountId: string;
  userEmail: string;
  provider: string;
}) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  const sentEmails = await emailProvider.getSentMessages(50);

  const sentEmailsWithThreads = (
    await Promise.all(
      sentEmails.map(async (message) => {
        const thread = await emailProvider.getThread(message.threadId || "");

        const lastMessage = thread.messages?.[thread.messages?.length - 1];
        const lastMessageFrom = lastMessage?.headers?.from;
        const isSentByUser = lastMessageFrom?.includes(userEmail);

        if (isSentByUser)
          return {
            ...message,
            thread: {
              ...thread,
              messages: thread.messages,
            },
          };
      }) || [],
    )
  ).filter(isDefined);

  return sentEmailsWithThreads;
}

export const GET = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const userEmail = request.auth.email;

  const result = await getNoReply({
    emailAccountId,
    userEmail,
    provider: request.emailProvider.name,
  });

  return NextResponse.json(result);
});
