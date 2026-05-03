import { useState } from "react";
import type { FormEvent } from "react";
import type { ConversationMessage } from "../lib/api";

export type FlowStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

interface ConversationPanelProps {
  messages: ConversationMessage[];
  status: FlowStatus;
  transcriptDraft: string;
  error?: string;
  liveEnabled: boolean;
  canReplay: boolean;
  canInterrupt: boolean;
  onLiveToggle: () => void;
  onReplay: () => void;
  onInterrupt: () => void;
  onTextSubmit: (text: string) => void;
}

const statusLabel: Record<FlowStatus, string> = {
  idle: "Ready",
  listening: "Listening",
  transcribing: "Transcribing",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Needs attention"
};

const Icon = ({
  name,
  size = 20
}: {
  name: "mic" | "mic-off" | "play" | "send" | "square";
  size?: number;
}) => {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2
  };

  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size} {...common}>
      {name === "mic" ? (
        <>
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <path d="M12 19v3" />
        </>
      ) : null}
      {name === "mic-off" ? (
        <>
          <path d="m2 2 20 20" />
          <path d="M9 9v3a3 3 0 0 0 5.1 2.1" />
          <path d="M15 9.3V6a3 3 0 0 0-5.1-2.1" />
          <path d="M19 10v2a7 7 0 0 1-.7 3" />
          <path d="M5 10v2a7 7 0 0 0 10.7 5.9" />
          <path d="M12 19v3" />
        </>
      ) : null}
      {name === "play" ? <path d="m8 5 11 7-11 7Z" /> : null}
      {name === "send" ? (
        <>
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </>
      ) : null}
      {name === "square" ? <rect height="12" rx="1" width="12" x="6" y="6" /> : null}
    </svg>
  );
};

export function ConversationPanel({
  messages,
  status,
  transcriptDraft,
  error,
  liveEnabled,
  canReplay,
  canInterrupt,
  onLiveToggle,
  onReplay,
  onInterrupt,
  onTextSubmit
}: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const isBusy = status === "thinking" || status === "transcribing";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isBusy) {
      return;
    }

    setDraft("");
    onTextSubmit(text);
  };

  return (
    <section className="conversation-panel" aria-label="Conversation">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Conversation</p>
          <h1>Mirror</h1>
        </div>
        <span className={`status-pill status-${status}`}>{statusLabel[status]}</span>
      </div>

      <div className="message-list" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start talking when Mirror is listening.</h2>
            <p>The mic stays live, pauses during replies, then resumes automatically.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              <div className="message-meta">
                <span>{message.role === "user" ? "You" : "Mirror"}</span>
                <time dateTime={message.createdAt}>
                  {new Intl.DateTimeFormat(undefined, {
                    hour: "2-digit",
                    minute: "2-digit"
                  }).format(new Date(message.createdAt))}
                </time>
              </div>
              <p>{message.content}</p>
            </article>
          ))
        )}

        {transcriptDraft ? (
          <article className="message message-draft">
            <div className="message-meta">
              <span>Transcript</span>
            </div>
            <p>{transcriptDraft}</p>
          </article>
        ) : null}
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-input">
          Type a message
        </label>
        <textarea
          id="chat-input"
          value={draft}
          rows={2}
          placeholder="質問を入力..."
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="icon-action chat-send"
          type="submit"
          disabled={!draft.trim() || isBusy}
          title="Send message"
          aria-label="Send message"
        >
          <Icon name="send" size={18} />
        </button>
      </form>

      <div className="conversation-actions">
        <button
          className={`primary-action ${liveEnabled ? "recording" : ""}`}
          type="button"
          onClick={onLiveToggle}
          aria-pressed={liveEnabled}
          title={liveEnabled ? "Pause live conversation" : "Resume live conversation"}
        >
          <Icon name={liveEnabled ? "mic-off" : "mic"} />
          <span>{liveEnabled ? "Pause Live" : "Resume Live"}</span>
        </button>

        <button
          className="icon-action"
          type="button"
          onClick={onReplay}
          disabled={!canReplay}
          title="Replay last response"
          aria-label="Replay last response"
        >
          <Icon name={status === "speaking" ? "square" : "play"} size={19} />
        </button>

        <button
          className="secondary-action compact-action"
          type="button"
          onClick={onInterrupt}
          disabled={!canInterrupt}
          title="Interrupt current response"
        >
          Interrupt
        </button>
      </div>
    </section>
  );
}
