import { headers } from "next/headers";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const email =
    requestHeaders.get("Cf-Access-Authenticated-User-Email") || "local@dev";
  return { userId: email, displayName: email.split("@")[0], email, fullName: null };
}

export async function requireChatGPTUser(_returnTo: string): Promise<ChatGPTUser> {
  return (await getChatGPTUser())!;
}

export function chatGPTSignInPath(returnTo: string): string { return returnTo; }
export function chatGPTSignOutPath(returnTo = "/"): string { return returnTo; }
