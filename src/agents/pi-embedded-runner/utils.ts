import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";

/** Maps OpenClaw think level to pi-agent ThinkingLevel. Returns undefined for "off" so the key is omitted from the payload (Bug #7115). */
export function mapThinkingLevel(level?: ThinkLevel): ThinkingLevel | undefined {
  // pi-agent-core supports "xhigh"; OpenClaw enables it for specific models.
  if (!level || level === "off") {
    return undefined;
  }
  return level;
}

export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
}

export type { ReasoningLevel, ThinkLevel };
