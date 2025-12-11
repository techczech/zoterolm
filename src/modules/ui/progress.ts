/**
 * Progress and status tracking for LLM operations
 */

export type ProgressStage =
  | "idle"
  | "preparing"
  | "extracting"
  | "encoding"
  | "calling_api"
  | "waiting"
  | "receiving"
  | "processing"
  | "saving"
  | "complete"
  | "error";

export interface ProgressState {
  stage: ProgressStage;
  progress: number; // 0-100
  message: string;
  details?: string;
  error?: string;
  logs: LogEntry[];
  startTime: number;
  endTime?: number;
}

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  details?: string;
}

// Stage descriptions
const STAGE_DESCRIPTIONS: Record<ProgressStage, string> = {
  idle: "Ready",
  preparing: "Preparing request...",
  extracting: "Extracting text from PDF...",
  encoding: "Encoding PDF for upload...",
  calling_api: "Calling LLM API...",
  waiting: "Waiting for response...",
  receiving: "Receiving response...",
  processing: "Processing response...",
  saving: "Saving summary...",
  complete: "Complete",
  error: "Error occurred",
};

// Stage progress values
const STAGE_PROGRESS: Record<ProgressStage, number> = {
  idle: 0,
  preparing: 5,
  extracting: 15,
  encoding: 25,
  calling_api: 35,
  waiting: 50,
  receiving: 70,
  processing: 85,
  saving: 95,
  complete: 100,
  error: 0,
};

/**
 * Progress tracker class
 */
export class ProgressTracker {
  private state: ProgressState;
  private listeners: Array<(state: ProgressState) => void> = [];

  constructor() {
    this.state = {
      stage: "idle",
      progress: 0,
      message: STAGE_DESCRIPTIONS.idle,
      logs: [],
      startTime: Date.now(),
    };
  }

  /**
   * Subscribe to progress updates
   */
  subscribe(listener: (state: ProgressState) => void): () => void {
    this.listeners.push(listener);
    // Immediately notify with current state
    listener(this.state);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notify(): void {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  /**
   * Add a log entry
   */
  log(level: LogEntry["level"], message: string, details?: string): void {
    this.state.logs.push({
      timestamp: Date.now(),
      level,
      message,
      details,
    });
    this.notify();
  }

  /**
   * Set the current stage
   */
  setStage(stage: ProgressStage, customMessage?: string): void {
    this.state.stage = stage;
    this.state.progress = STAGE_PROGRESS[stage];
    this.state.message = customMessage || STAGE_DESCRIPTIONS[stage];

    if (stage === "complete") {
      this.state.endTime = Date.now();
    }

    this.log("info", this.state.message);
    this.notify();
  }

  /**
   * Set custom progress within current stage
   */
  setProgress(progress: number, message?: string): void {
    this.state.progress = Math.min(100, Math.max(0, progress));
    if (message) {
      this.state.message = message;
    }
    this.notify();
  }

  /**
   * Set details (secondary message)
   */
  setDetails(details: string): void {
    this.state.details = details;
    this.notify();
  }

  /**
   * Set error state
   */
  setError(error: string, details?: string): void {
    this.state.stage = "error";
    this.state.error = error;
    this.state.message = `Error: ${error}`;
    this.state.details = details;
    this.state.endTime = Date.now();
    this.log("error", error, details);
    this.notify();
  }

  /**
   * Reset tracker for new operation
   */
  reset(): void {
    this.state = {
      stage: "idle",
      progress: 0,
      message: STAGE_DESCRIPTIONS.idle,
      logs: [],
      startTime: Date.now(),
    };
    this.notify();
  }

  /**
   * Get current state
   */
  getState(): ProgressState {
    return { ...this.state };
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedTime(): number {
    const endTime = this.state.endTime || Date.now();
    return (endTime - this.state.startTime) / 1000;
  }

  /**
   * Format logs as text
   */
  getLogsAsText(): string {
    return this.state.logs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const prefix =
          log.level === "error"
            ? "❌"
            : log.level === "warn"
              ? "⚠️"
              : log.level === "debug"
                ? "🔍"
                : "ℹ️";
        let text = `[${time}] ${prefix} ${log.message}`;
        if (log.details) {
          text += `\n    ${log.details}`;
        }
        return text;
      })
      .join("\n");
  }
}

// Global progress tracker instance
let globalTracker: ProgressTracker | null = null;

/**
 * Get or create the global progress tracker
 */
export function getProgressTracker(): ProgressTracker {
  if (!globalTracker) {
    globalTracker = new ProgressTracker();
  }
  return globalTracker;
}

/**
 * Create a new progress tracker (for isolated operations)
 */
export function createProgressTracker(): ProgressTracker {
  return new ProgressTracker();
}
