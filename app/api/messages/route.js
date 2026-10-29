// GET /api/messages → recent conversation, oldest first (so the chat survives a reload)
// The public demo starts every visitor with an empty chat (the founder's chats stay private).
import { recentMessages } from "@/lib/store";
import { isDemo } from "@/lib/demo";
import { route } from "@/lib/http";

export const GET = route(async () => Response.json({ messages: isDemo() ? [] : await recentMessages(30) }));
