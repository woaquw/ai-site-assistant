import { SYSTEM_PROMPT } from "./knowledge";

export interface Env {
  AI: Ai;
  MODEL: string;
  ALLOWED_ORIGINS: string;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 12; // only the latest part of the conversation is sent to the model
const MAX_CHARS = 600; // per message
const MAX_TOKENS = 350; // length of one answer

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };

    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname === "/health") return json({ ok: true, model: env.MODEL }, 200, cors);
    if (url.pathname !== "/chat" || request.method !== "POST") return json({ error: "Not found" }, 404, cors);

    // Only the studio website may use this endpoint (blocks other sites from spending the quota).
    if (!allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403, cors);

    let messages: ChatMessage[];
    try {
      const body = (await request.json()) as { messages?: unknown };
      messages = sanitize(body.messages);
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "The last message must be from the user" }, 400, cors);
    }

    try {
      const stream = (await env.AI.run(env.MODEL as keyof AiModels, {
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        stream: true,
      } as never)) as ReadableStream;

      // Workers AI streams Server-Sent Events: `data: {"response":"..."}` ... `data: [DONE]`
      return new Response(stream, {
        headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    } catch (err) {
      console.error("AI error", err);
      // 429-like errors happen when the free daily allowance is used up.
      return json({ error: "The assistant is unavailable right now. Please use the booking form or call us." }, 503, cors);
    }
  },
} satisfies ExportedHandler<Env>;

function sanitize(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m): m is ChatMessage =>
      !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_MESSAGES);
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
