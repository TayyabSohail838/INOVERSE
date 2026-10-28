// GET /api/messages → recent conversation, oldest first (so the chat survives a reload)
import { recentMessages } from "@/lib/store";
import { route } from "@/lib/http";

export const GET = route(async () => Response.json({ messages: await recentMessages(30) }));
