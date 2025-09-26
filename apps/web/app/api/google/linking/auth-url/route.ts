import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { SCOPES } from "@/utils/gmail/scopes";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const googleAuth = getLinkingOAuth2Client();

  const state = generateOAuthState({ userId });

  const url = googleAuth.generateAuthUrl({
    access_type: "offline",
    scope: [...new Set([...SCOPES, "openid", "email"])].join(" "),
    prompt: "consent",
    state,
  });

  return { url, state };
};

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const { url, state } = getAuthUrl({ userId });

  const response = NextResponse.json({ url });

  response.cookies.set(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
