"use client";

import React, { useState } from "react";
import { approveAction } from "@/lib/api";

interface ApprovalCardProps {
  previewId: string;
  toolName: string;
  diff: {
    currentValue: Record<string, unknown>;
    proposedValue: Record<string, unknown>;
  };
  expiresAt: string;
  onResolved: (status: "committed" | "rejected" | "expired") => void;
}

export function ApprovalCard({ previewId, toolName, diff, expiresAt, onResolved }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"pending" | "committed" | "rejected" | "expired">("pending");
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (decision: "approve" | "reject") => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const data = await approveAction(previewId, decision, controller.signal);
      clearTimeout(timeout);
      const newStatus = data.status as "committed" | "rejected";
      setStatus(newStatus);
      onResolved(newStatus);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.message === "ALREADY_PROCESSED") {
        setStatus("expired");
        onResolved("expired");
        setError("This request was already processed.");
      } else if (err instanceof Error && err.message === "EXPIRED") {
        setStatus("expired");
        onResolved("expired");
        setError("This request has expired.");
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  if (status !== "pending") {
    const statusStyles = {
      committed: "bg-emerald-50 border-emerald-200 text-emerald-800",
      rejected: "bg-rose-50 border-rose-200 text-rose-800",
      expired: "bg-amber-50 border-amber-200 text-amber-800",
    };

    return (
      <div className={`border rounded-lg p-4 shadow-sm max-w-md ${statusStyles[status] || "bg-gray-50 border-gray-200"}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {status === "committed" && "Changes Applied"}
            {status === "rejected" && "Changes Rejected"}
            {status === "expired" && "Request Expired"}
          </span>
        </div>
        {error && <p className="text-xs mt-1 opacity-75">{error}</p>}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm max-w-md">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800">Review Action</h4>
        <span className="text-xs font-medium text-brand bg-brand-soft px-2 py-0.5 rounded-full">
          {toolName}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {Object.keys(diff.proposedValue).map((key) => (
          <div key={key} className="text-xs font-mono border-b border-gray-100 pb-2 last:border-0">
            <span className="text-gray-500 font-sans text-[11px] uppercase tracking-wide block mb-1">
              {key}
            </span>
            <div className="bg-rose-50 border border-rose-200 rounded px-2 py-1 mb-1">
              <span className="text-rose-600 line-through">{String(diff.currentValue[key] ?? "—")}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
              <span className="text-emerald-700">{String(diff.proposedValue[key] ?? "—")}</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3" role="alert">
          <p className="text-xs text-rose-700">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          Expires {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <div className="flex gap-2">
          <button
            disabled={loading}
            onClick={() => handleDecision("reject")}
            className="px-3 py-1.5 text-xs font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50 transition-colors"
            aria-disabled={loading}
          >
            {loading ? "..." : "Reject"}
          </button>
          <button
            disabled={loading}
            onClick={() => handleDecision("approve")}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-deep disabled:opacity-50 transition-colors"
            aria-disabled={loading}
          >
            {loading ? "Processing..." : "Approve Change"}
          </button>
        </div>
      </div>
    </div>
  );
}
