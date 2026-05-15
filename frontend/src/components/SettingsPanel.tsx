import type { ChangeEvent } from "react";
import type { MirrorSettings, SlideAction, SlideDeck } from "../lib/api";

interface SettingsPanelProps {
  settings: MirrorSettings;
  level: number;
  logs: string[];
  slideDeck: SlideDeck;
  activeSlidePage: number | null;
  selectedSlideVideoName?: string;
  onSettingsChange: (settings: MirrorSettings) => void;
  onResetConversation: () => void;
  onSlideAction: (action: SlideAction) => void;
  onExplainSlide: () => void;
  onSlidePdfUpload: (file: File) => void;
  onSlideVideoSelect: (file: File) => void;
  onSlideVideoClear: () => void;
}

const Icon = ({
  name,
  size = 18
}: {
  name: "reset" | "shield" | "volume" | "slides";
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
      {name === "volume" ? (
        <>
          <path d="M11 5 6 9H3v6h3l5 4Z" />
          <path d="M16 9.5a4 4 0 0 1 0 5" />
          <path d="M19 7a8 8 0 0 1 0 10" />
        </>
      ) : null}
      {name === "shield" ? (
        <path d="M12 3 5 6v5c0 4.5 2.8 8.3 7 10 4.2-1.7 7-5.5 7-10V6Z" />
      ) : null}
      {name === "reset" ? (
        <>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v6h6" />
        </>
      ) : null}
      {name === "slides" ? (
        <>
          <rect height="12" rx="2" width="18" x="3" y="5" />
          <path d="M8 19h8" />
          <path d="M12 17v2" />
        </>
      ) : null}
    </svg>
  );
};

export function SettingsPanel({
  settings,
  level,
  logs,
  slideDeck,
  activeSlidePage,
  selectedSlideVideoName,
  onSettingsChange,
  onResetConversation,
  onSlideAction,
  onExplainSlide,
  onSlidePdfUpload,
  onSlideVideoSelect,
  onSlideVideoClear
}: SettingsPanelProps) {
  const update = <Key extends keyof MirrorSettings>(key: Key, value: MirrorSettings[Key]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handlePdfChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSlidePdfUpload(file);
    }
    event.target.value = "";
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSlideVideoSelect(file);
    }
    event.target.value = "";
  };

  const detectedVideoLanguages = Object.keys(slideDeck.video_urls ?? {}).sort();
  const hasDefaultVideo = Boolean(slideDeck.video_url || detectedVideoLanguages.length > 0);

  return (
    <aside className="settings-panel" aria-label="Settings and privacy">
      <div className="settings-section settings-section--voice">
        <div className="section-heading">
          <Icon name="volume" />
          <h2>Voice</h2>
        </div>

        <label className="field settings-field--api-base">
          <span>API base</span>
          <input
            value={settings.endpointBase}
            onChange={(event) => update("endpointBase", event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="field settings-field--model">
          <span>Model</span>
          <input
            value={settings.model}
            onChange={(event) => update("model", event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="field settings-field--voice-select">
          <span>TTS voice</span>
          <select value={settings.voice} onChange={(event) => update("voice", event.target.value)}>
            <option value="default">Default TTS</option>
            <option value="windows-default">Windows default TTS</option>
            <option value="Ota">Ota speaker</option>
          </select>
        </label>

        <label className="field settings-field--max-response">
          <span>Max response tokens</span>
          <input
            min="32"
            max="256"
            step="8"
            type="number"
            value={settings.maxResponseTokens}
            onChange={(event) => update("maxResponseTokens", Number(event.target.value))}
          />
        </label>

        <label className="field settings-field--max-speech">
          <span>Max speech chars</span>
          <input
            min="80"
            max="600"
            step="20"
            type="number"
            value={settings.maxSpeechChars}
            onChange={(event) => update("maxSpeechChars", Number(event.target.value))}
          />
        </label>

        <label className="field settings-field--stt-mode">
          <span>Speech recognition</span>
          <select
            value={settings.sttMode}
            onChange={(event) => update("sttMode", event.target.value as MirrorSettings["sttMode"])}
          >
            <option value="browser">Browser continuous</option>
            <option value="backend">Backend Whisper window</option>
          </select>
        </label>

        <label className="field settings-field--language">
          <span>Language</span>
          <select
            value={settings.language}
            onChange={(event) => update("language", event.target.value as MirrorSettings["language"])}
          >
            <option value="auto">Auto match input</option>
            <option value="ja">Japanese</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="toggle-row settings-field--autoplay">
          <span>Autoplay response</span>
          <input
            type="checkbox"
            checked={settings.autoplay}
            onChange={(event) => update("autoplay", event.target.checked)}
          />
        </label>

        <div className="level-meter" aria-label={`Playback level ${Math.round(level * 100)} percent`}>
          <span style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>

      <div className="settings-section settings-section--slides">
        <div className="section-heading">
          <Icon name="slides" />
          <h2>Slides</h2>
        </div>

        <div className="slide-actions">
          <button type="button" onClick={() => onSlideAction("start")}>Start</button>
          <button type="button" onClick={() => onSlideAction("previous")}>Prev</button>
          <button type="button" onClick={() => onSlideAction("next")}>Next</button>
          <button type="button" onClick={() => onSlideAction("stop")}>Stop</button>
          <button className="slide-actions__wide" type="button" onClick={onExplainSlide}>Explain</button>
        </div>

        <label className="field slide-upload">
          <span>Slide PDF</span>
          <input accept="application/pdf" type="file" onChange={handlePdfChange} />
        </label>

        <label className="field slide-upload">
          <span>Presentation video</span>
          <input accept="video/mp4,video/*" type="file" onChange={handleVideoChange} />
        </label>

        <div className="slide-video-status">
          {selectedSlideVideoName ? (
            <>
              <span>Selected video: <strong>{selectedSlideVideoName}</strong></span>
              <button type="button" onClick={onSlideVideoClear}>Clear video</button>
            </>
          ) : hasDefaultVideo ? (
            <span>
              Default video detected
              {detectedVideoLanguages.length ? `: ${detectedVideoLanguages.join(", ").toUpperCase()}` : ""}
            </span>
          ) : (
            <span>No presentation video selected</span>
          )}
        </div>

        <div className="slide-deck-status">
          {slideDeck.pages.length > 0 ? (
            <>
              <strong>{slideDeck.filename}</strong>
              <span>
                {slideDeck.pages.length} pages
                {activeSlidePage ? `, current ${activeSlidePage}` : ""}
              </span>
            </>
          ) : (
            <span>No PDF loaded</span>
          )}
        </div>
      </div>

      <div className="settings-section settings-section--privacy">
        <div className="section-heading">
          <Icon name="shield" />
          <h2>Privacy</h2>
        </div>

        <label className="toggle-row">
          <span>Send microphone audio for transcription</span>
          <input
            type="checkbox"
            checked={settings.shareMicrophoneAudio}
            onChange={(event) => update("shareMicrophoneAudio", event.target.checked)}
          />
        </label>

        <label className="toggle-row">
          <span>Allow transcript persistence</span>
          <input
            type="checkbox"
            checked={settings.persistTranscript}
            onChange={(event) => update("persistTranscript", event.target.checked)}
          />
        </label>

        <button className="secondary-action" type="button" onClick={onResetConversation}>
          <Icon name="reset" size={17} />
          <span>Reset</span>
        </button>
      </div>

      <div className="settings-section settings-section--activity log-section">
        <h2>Activity</h2>
        <ol className="log-list">
          {logs.map((log, index) => (
            <li key={`${log}-${index}`}>{log}</li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
