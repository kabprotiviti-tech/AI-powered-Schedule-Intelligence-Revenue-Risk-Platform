"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Send, Sparkles, RefreshCw, AlertTriangle,
  ChevronDown, StopCircle, Bot, User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  error?:  boolean;
}

// ─── Quick-action chips ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Top issues",        query: "What are the top 3 schedule issues driving the most risk right now?" },
  { label: "Fix first",         query: "What should I fix first to have the biggest impact on risk score?" },
  { label: "Critical path",     query: "Which activities are on the critical path and causing the most delay?" },
  { label: "Logic violations",  query: "Show me the logic violations — which activities are missing predecessor or successor links?" },
  { label: "Cost risk",         query: "Where is cost at risk and what is driving the EAC overrun?" },
  { label: "On-time odds",      query: "What is the probability of finishing on time and what are the top uncertainty drivers?" },
  { label: "WBS hotspots",      query: "Which WBS areas have the highest concentration of schedule violations?" },
  { label: "Neg float",         query: "Which activities have negative float and how much delay are they driving?" },
] as const;

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  // Escape HTML first (safe)
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return safe
    // **bold**
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // `code`
    .replace(/`([^`]+)`/g, '<code class="bg-surface/80 px-1 py-0.5 rounded text-[11px] font-mono text-primary/90">$1</code>')
    // Numbered list items (1. 2. etc.)
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-2 mt-1"><span class="text-primary font-semibold tabular-nums shrink-0">$1.</span><span>$2</span></div>')
    // Bullet list items (• or -)
    .replace(/^[•\-] (.+)$/gm, '<div class="flex gap-2 mt-0.5"><span class="text-primary shrink-0">•</span><span>$1</span></div>')
    // Double newline → paragraph break
    .replace(/\n\n/g, '<div class="mt-3"></div>')
    // Single newline
    .replace(/\n/g, "<br>");
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="flex items-start gap-2 max-w-[85%]">
          <div className="bg-primary text-white rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">
            {msg.content}
          </div>
          <span className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
            <User className="w-3.5 h-3.5 text-primary" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="flex items-start gap-2 max-w-[92%]">
        <span className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </span>
        <div
          className={`rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed ${
            msg.error
              ? "bg-danger/10 border border-danger/20 text-danger"
              : "bg-card border border-border text-text-primary"
          }`}
        >
          {msg.error ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {msg.content}
            </div>
          ) : (
            <div
              className="space-y-0.5"
              // Safe: renderMarkdown escapes HTML before adding tags
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex justify-start mb-3">
      <div className="flex items-start gap-2">
        <span className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </span>
        <div className="bg-card border border-border rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main CopilotPanel ────────────────────────────────────────────────────────

interface CopilotPanelProps {
  projectId: string;
  open:      boolean;
  onClose:   () => void;
}

export function CopilotPanel({ projectId, open, onClose }: CopilotPanelProps) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showChips, setShowChips] = useState(true);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const streamIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function newId() { return Math.random().toString(36).slice(2, 10); }

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { id: newId(), role: "user",      content: text.trim() };
    const asstId = newId();
    const asstMsg: Message = { id: asstId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setStreaming(true);
    setShowChips(false);

    // Build history (exclude the empty assistant stub we just added)
    const history = messages
      .filter((m) => m.content && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    const abort = new AbortController();
    abortRef.current = abort;
    streamIdRef.current = asstId;

    try {
      const res = await fetch("/api/copilot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  abort.signal,
        body:    JSON.stringify({ project_id: projectId, message: text.trim(), history }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;

          try {
            const chunk = JSON.parse(raw) as { text?: string; error?: string };
            if (chunk.error) {
              setMessages((prev) =>
                prev.map((m) => m.id === asstId ? { ...m, content: chunk.error!, error: true } : m),
              );
              return;
            }
            if (chunk.text) {
              setMessages((prev) =>
                prev.map((m) => m.id === asstId ? { ...m, content: m.content + chunk.text! } : m),
              );
            }
          } catch { /* ignore JSON parse errors on malformed chunks */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) => m.id === asstId && !m.content ? { ...m, content: "Response stopped.", error: false } : m),
        );
        return;
      }
      const msg = err instanceof Error ? err.message : "Connection error";
      setMessages((prev) =>
        prev.map((m) => m.id === asstId ? { ...m, content: msg, error: true } : m),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, projectId, streaming]);

  function stopStream() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function clearHistory() {
    setMessages([]);
    setShowChips(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  if (!open) return null;

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />

      {/* Panel */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full max-w-[440px] bg-canvas border-l border-border shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">NEXUS Copilot</p>
            <p className="text-[11px] text-text-secondary">AI Schedule Intelligence</p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface rounded-md transition-colors"
                title="Clear conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Messages ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center pb-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">Ask anything about your schedule</p>
                <p className="text-xs text-text-secondary mt-1 max-w-[260px] leading-relaxed">
                  I have real-time access to DCMA, CPM, EVM, and Monte Carlo data for this project.
                </p>
              </div>
              {/* Example outputs */}
              <div className="w-full max-w-[340px] bg-surface/60 rounded-xl border border-border p-3 text-left space-y-2">
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Example answers I give</p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  <strong className="text-text-primary">"124 activities have missing logic</strong> (DCMA LOGIC violation), contributing 18.2% to schedule risk. Fixing the top 20 will reduce risk by 12%."
                </p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  <strong className="text-text-primary">"Activity A-0234 is on the critical path</strong> with −18d negative float, driving a 45-day finish variance. It also fails DCMA LOGIC — a compound risk."
                </p>
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Typing dots (only while waiting for first token) */}
          {streaming && messages[messages.length - 1]?.content === "" && <TypingDots />}
        </div>

        {/* ── Quick-action chips ── */}
        {showChips && (
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-[10px] text-text-secondary font-medium uppercase tracking-wider">Quick actions</p>
              <button onClick={() => setShowChips(false)} className="ml-auto text-text-secondary/60 hover:text-text-secondary">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => sendMessage(qa.query)}
                  disabled={streaming}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-40"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Input area ── */}
        <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
          <div className="flex items-end gap-2 bg-surface rounded-xl border border-border focus-within:border-primary/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about schedule risk, violations, actions…"
              rows={1}
              disabled={streaming}
              className="flex-1 bg-transparent resize-none px-3.5 py-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none disabled:opacity-60 max-h-32 overflow-y-auto leading-relaxed"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            {streaming ? (
              <button
                onClick={stopStream}
                className="m-2 p-1.5 rounded-lg text-danger hover:bg-danger/10 transition-colors shrink-0"
                title="Stop generating"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="m-2 p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                title="Send (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-text-secondary/50 text-center mt-1.5">
            Enter to send · Shift+Enter for new line · AI may make mistakes
          </p>
        </div>
      </aside>
    </>
  );
}

// ─── Floating trigger button ──────────────────────────────────────────────────

export function CopilotTrigger({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`
        fixed bottom-6 right-6 z-30
        flex items-center gap-2.5 px-4 py-3
        rounded-2xl shadow-lg border transition-all duration-200
        ${active
          ? "bg-primary border-primary/40 text-white"
          : "bg-canvas border-border text-text-primary hover:border-primary/30 hover:bg-primary/5 hover:shadow-xl"
        }
      `}
      aria-label="Open AI Copilot"
    >
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${active ? "bg-white/20" : "bg-primary/10"}`}>
        <Sparkles className={`w-3.5 h-3.5 ${active ? "text-white" : "text-primary"}`} />
      </div>
      <span className="text-sm font-semibold">NEXUS Copilot</span>
      {!active && (
        <span className="w-2 h-2 rounded-full bg-success animate-pulse" title="Ready" />
      )}
    </button>
  );
}
