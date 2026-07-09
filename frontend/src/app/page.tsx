"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ApprovalCard } from "@/components/ApprovalCard";
import { sendChatMessage, demoLogin, setAuthToken } from "@/lib/api";

interface PendingApproval {
  previewId: string;
  toolName: string;
  diff: { currentValue: Record<string, unknown>; proposedValue: Record<string, unknown> };
  expiresAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  pendingApproval?: PendingApproval;
}

const DEMO_VENDORS = [
  { id: "vendor-a-0001-0000-0000-000000000001", name: "Sharma Sports Academy", location: "Mumbai", owner: "Rahul Sharma" },
  { id: "vendor-b-0002-0000-0000-000000000002", name: "Patel Fitness Hub", location: "Delhi", owner: "Priya Patel" },
];

const QUICK_ACTIONS = [
  "What is today's revenue?",
  "Find trial members",
  "Show me this week's revenue",
  "Find members with expiring memberships",
];

function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

function getOrCreateConversation(): string {
  if (typeof window === "undefined") return "ssr";
  let cid = localStorage.getItem("hobbyfi_conv_id");
  if (!cid) {
    cid = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
    localStorage.setItem("hobbyfi_conv_id", cid);
  }
  return cid;
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hello! I'm your HobbyFi Copilot. I can help you check revenue, find members, extend trials, or send notifications. What would you like to do?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ token: string; vendorName: string; vendorId: string } | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef(getOrCreateConversation());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    if (!text) setInput("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: Message = { id: generateId(), role: "user", text: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const data = await sendChatMessage(msg, conversationId.current, controller.signal);
      clearTimeout(timeout);

      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        text: data.reply,
        pendingApproval: data.pendingApproval,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: "assistant", text: "Request timed out. Please try again." },
        ]);
      } else if (err instanceof Error && err.message === "SESSION_EXPIRED") {
        setSession(null);
        localStorage.removeItem("hobbyfi_token");
        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: "assistant", text: "Session expired. Please log in again." },
        ]);
      } else if (err instanceof Error && err.message === "RATE_LIMITED") {
        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: "assistant", text: "Too many requests. Please wait a moment." },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            text: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleResolved = useCallback((_status: "committed" | "rejected" | "expired") => {
    // Could show a toast notification here
  }, []);

  const handleDemoLogin = async (vendorId: string) => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const data = await demoLogin(vendorId);
      setAuthToken(data.token);
      localStorage.setItem("hobbyfi_token", data.token);
      setSession({ token: data.token, vendorName: data.vendorName, vendorId });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  // Login screen
  if (!session) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-brand rounded-xl mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">HobbyFi Copilot</h1>
            <p className="text-sm text-gray-500 mt-1">AI-Powered Vendor Assistant</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Select a demo vendor
            </p>
            {DEMO_VENDORS.map((v) => (
              <button
                key={v.id}
                onClick={() => handleDemoLogin(v.id)}
                disabled={loggingIn}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand hover:bg-brand-soft transition-colors disabled:opacity-50 group"
              >
                <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-deep">
                  {v.name}
                </p>
                <p className="text-xs text-gray-400">
                  {v.location} &middot; {v.owner}
                </p>
              </button>
            ))}
          </div>

          {loginError && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2" role="alert">
              <p className="text-xs text-rose-700">{loginError}</p>
            </div>
          )}

          <p className="mt-6 text-center text-[10px] text-gray-400">
            Secured with JWT &middot; No data shared
          </p>
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] h-[700px]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-brand rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">HobbyFi Copilot</h1>
              <p className="text-xs text-gray-400">{session.vendorName}</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("hobbyfi_token");
              setSession(null);
            }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Switch vendor"
          >
            Switch
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] ${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
                  {msg.text}
                </div>
              </div>
              {msg.pendingApproval && (
                <div className="mt-2 flex justify-start">
                  <ApprovalCard
                    previewId={msg.pendingApproval.previewId}
                    toolName={msg.pendingApproval.toolName}
                    diff={msg.pendingApproval.diff}
                    expiresAt={msg.pendingApproval.expiresAt}
                    onResolved={handleResolved}
                  />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="chat-bubble-assistant">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          {/* Quick actions — only on first message */}
          {messages.length === 1 && !loading && (
            <div className="flex flex-wrap gap-2 mt-4">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => handleSend(action)}
                  className="px-3 py-1.5 text-xs font-medium text-brand bg-brand-soft border border-brand/20 rounded-full hover:bg-brand hover:text-white transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Ask about revenue, members, trials..."
              className="input-field"
              disabled={loading}
              aria-label="Chat message input"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="btn-primary px-5"
              aria-label="Send message"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
