/**
 * POST /api/copilot
 *
 * Body: { project_id, message, history? }
 * Response: text/event-stream  (SSE)
 *   data: {"text":"..."}   — streamed delta chunks
 *   data: [DONE]           — end of stream
 */
export const runtime    = "nodejs";
export const maxDuration = 60;

import { NextRequest }       from "next/server";
import Anthropic             from "@anthropic-ai/sdk";
import { getEngineResult }   from "@/lib/reports/data-builder";
import { buildContext, SYSTEM_PROMPT } from "@/lib/copilot/context";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  let body: { project_id: string; message: string; history?: { role: "user" | "assistant"; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { project_id, message, history = [] } = body;
  if (!project_id || !message?.trim()) {
    return new Response(JSON.stringify({ error: "project_id and message are required" }), { status: 400 });
  }

  const result = await getEngineResult(project_id);
  if (!result) {
    return new Response(JSON.stringify({ error: `Project "${project_id}" not found` }), { status: 404 });
  }

  // Build context from engine outputs based on query intent
  const context = buildContext(result, message, project_id);

  const systemWithData = `${SYSTEM_PROMPT}\n\n${"━".repeat(32)}\nPROJECT DATA\n${"━".repeat(32)}\n${context}`;

  // Build message history (keep last 10 turns to stay within token limits)
  const recentHistory = history.slice(-10);
  const messages: Anthropic.MessageParam[] = [
    ...recentHistory,
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = client.messages.stream({
          model:      "claude-sonnet-4-6",
          max_tokens: 1024,
          system:     systemWithData,
          messages,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            event.delta.text
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`),
            );
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
