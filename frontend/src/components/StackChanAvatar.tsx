import type { CSSProperties } from "react";
import type { FlowStatus } from "./ConversationPanel";
import "./StackChanAvatar.css";

interface StackChanAvatarProps {
  audioLevel: number;
  status: FlowStatus;
  isListening: boolean;
  isSpeaking: boolean;
}

export function StackChanAvatar({
  audioLevel,
  status,
  isListening,
  isSpeaking,
}: StackChanAvatarProps) {
  const mouthOpen = Math.max(0.08, Math.min(1, audioLevel * 1.45));
  const expression = status === "thinking" ? "thinking" : isSpeaking ? "speaking" : isListening ? "listening" : "idle";

  return (
    <section
      aria-label="Lightweight avatar"
      className="stack-avatar"
      data-expression={expression}
      style={{ "--mouth-open": mouthOpen } as CSSProperties}
    >
      <div className="stack-avatar__halo" />
      <div className="stack-avatar__body">
        <div className="stack-avatar__antenna">
          <span />
        </div>
        <div className="stack-avatar__head">
          <div className="stack-avatar__screen">
            <span className="stack-avatar__eye stack-avatar__eye--left" />
            <span className="stack-avatar__eye stack-avatar__eye--right" />
            <span className="stack-avatar__mouth" />
          </div>
          <div className="stack-avatar__cheek stack-avatar__cheek--left" />
          <div className="stack-avatar__cheek stack-avatar__cheek--right" />
        </div>
        <div className="stack-avatar__arm stack-avatar__arm--left" />
        <div className="stack-avatar__arm stack-avatar__arm--right" />
        <div className="stack-avatar__neck" />
        <div className="stack-avatar__base">
          <span />
        </div>
      </div>
      <div className="stack-avatar__shadow" />
    </section>
  );
}
