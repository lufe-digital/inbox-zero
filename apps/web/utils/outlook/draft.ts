import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { convertMessage } from "@/utils/outlook/message";

const logger = createScopedLogger("outlook/draft");

export async function getDraft(draftId: string, client: OutlookClient) {
  try {
    const response: Message = await client
      .getClient()
      .api(`/me/messages/${draftId}`)
      .get();
    const message = convertMessage(response);
    return message;
  } catch (error) {
    // Handle 404 errors
    if (error instanceof Error && "code" in error && error.code === 404) {
      return null;
    }

    // Handle Outlook's "object not found in store" error
    if (
      error instanceof Error &&
      error.message.includes("not found in the store")
    ) {
      return null;
    }

    throw error;
  }
}

export async function deleteDraft(client: OutlookClient, draftId: string) {
  try {
    logger.info("Deleting draft", { draftId });
    await client.getClient().api(`/me/messages/${draftId}`).delete();
    logger.info("Successfully deleted draft", { draftId });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 404) {
      logger.warn("Draft not found or already deleted, skipping deletion.", {
        draftId,
      });
    } else {
      logger.error("Failed to delete draft", { draftId, error });
      throw error;
    }
  }
}
