/**
 * In-memory debug logger for production debugging.
 * Stores logs that can be viewed in-app and copied.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: any;
}

const MAX_LOGS = 500;
let logs: LogEntry[] = [];
let listeners: Set<() => void> = new Set();

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 23);
}

function addLog(level: LogLevel, tag: string, message: string, data?: any) {
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    tag,
    message,
    data,
  };

  logs.push(entry);

  // Keep only the last MAX_LOGS entries
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS);
  }

  // Notify listeners asynchronously to avoid React state updates during render
  if (listeners.size > 0) {
    setTimeout(() => {
      listeners.forEach((fn) => fn());
    }, 0);
  }

  // Also log to console for development
  const consoleMsg = `[${entry.tag}] ${entry.message}`;
  const consoleData = data !== undefined ? data : "";

  switch (level) {
    case "debug":
      console.debug(consoleMsg, consoleData);
      break;
    case "info":
      console.log(consoleMsg, consoleData);
      break;
    case "warn":
      console.warn(consoleMsg, consoleData);
      break;
    case "error":
      console.error(consoleMsg, consoleData);
      break;
  }
}

export const DebugLogger = {
  debug: (tag: string, message: string, data?: any) => addLog("debug", tag, message, data),
  info: (tag: string, message: string, data?: any) => addLog("info", tag, message, data),
  warn: (tag: string, message: string, data?: any) => addLog("warn", tag, message, data),
  error: (tag: string, message: string, data?: any) => addLog("error", tag, message, data),

  getLogs: (): LogEntry[] => [...logs],

  clear: () => {
    logs = [];
    listeners.forEach((fn) => fn());
  },

  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Export logs as a formatted string for copying */
  exportAsText: (): string => {
    return logs
      .map((entry) => {
        let line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}`;
        if (entry.data !== undefined) {
          try {
            const dataStr =
              typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data, null, 2);
            line += `\n  Data: ${dataStr}`;
          } catch {
            line += `\n  Data: [unserializable]`;
          }
        }
        return line;
      })
      .join("\n\n");
  },
};

export type { LogEntry };
