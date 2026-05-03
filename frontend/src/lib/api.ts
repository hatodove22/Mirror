export type ChatRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface MirrorSettings {
  endpointBase: string;
  model: string;
  voice: string;
  maxResponseTokens: number;
  maxSpeechChars: number;
  sttMode: "browser" | "backend";
  autoplay: boolean;
  persistTranscript: boolean;
  shareMicrophoneAudio: boolean;
}

export interface TranscribeResponse {
  text: string;
  engine?: string;
  message?: string;
}

export interface ChatResponse {
  message?: Partial<ConversationMessage> & { content?: string };
  text?: string;
  response?: string;
}

export interface SpeechCacheResponse {
  speech_audio_id: string;
  audio_url: string;
  backend?: string;
  chunks?: number;
  bytes?: number;
  cached?: boolean;
}

export type SlideAction = "next" | "previous" | "first" | "last" | "start" | "stop";

export interface SlidePageSummary {
  page: number;
  title: string;
  summary: string;
  text?: string;
  spoken_script?: string;
  short_script?: string;
  role_in_talk?: string;
  keywords?: string[];
  supplemental_notes?: string[];
  likely_questions?: { question: string; answer: string }[];
  transition_to_next?: string;
  tts_warnings?: string[];
  score?: number;
  evidence_text?: string;
}

export interface SlideDeck {
  filename: string;
  pages: SlidePageSummary[];
  source?: string;
  deck_title?: string;
  deck_goal?: string;
  opening_script?: string;
  closing_script?: string;
  qa_index?: {
    intent: string;
    recommended_pages: number[];
    answer_strategy: string;
  }[];
}

export interface SlideSelectionResponse {
  selected: SlidePageSummary;
  candidates: SlidePageSummary[];
}

const trimBase = (base: string) => base.replace(/\/+$/, "");
const HISTORY_WINDOW = 8;

export const resolveApiAssetUrl = (assetUrl: string, settings: MirrorSettings) => {
  if (/^https?:\/\//i.test(assetUrl)) {
    return assetUrl;
  }

  const base = trimBase(settings.endpointBase);
  if (!/^https?:\/\//i.test(base)) {
    return assetUrl.startsWith("/") ? assetUrl : `${base}/${assetUrl.replace(/^\/+/, "")}`;
  }

  return new URL(assetUrl, `${base}/`).toString();
};

export const getSlidePageImageUrl = (settings: MirrorSettings, page = 1, width = 1440) =>
  resolveApiAssetUrl(
    `/api/slides/page/${Math.max(1, page)}.png?width=${Math.max(640, width)}`,
    settings
  );

const researchPresenterPrompt = (settings: MirrorSettings) => `
あなたは研究発表を代行する日本語のプレゼンターです。
回答は必ず自然な日本語の話し言葉にしてください。
読み上げるため、最大${settings.maxSpeechChars}文字を目安に短く答えてください。
絵文字、Markdown、箇条書き、URL、コードブロック、読みにくい記号は使わないでください。
根拠スライドが渡された場合は、その内容だけを根拠に答えてください。
根拠にない内容は推測せず、「このスライドからは断定できません」と短く述べてください。
回答の冒頭で、必要に応じて「この点は何ページの内容です」と自然に示してください。
`.trim();
const sanitizeAssistantText = (text: string, maxChars: number) => {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_#>\[\]{}|~]/g, "")
    .replace(/https?:\/\/\S+/g, "リンク")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  const boundary = Math.max(
    cleaned.lastIndexOf("。", maxChars),
    cleaned.lastIndexOf("！", maxChars),
    cleaned.lastIndexOf("？", maxChars)
  );
  return `${cleaned.slice(0, boundary > 80 ? boundary + 1 : maxChars).trim()}。`;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export async function transcribeAudio(
  audioBlob: Blob,
  settings: MirrorSettings,
  signal?: AbortSignal
): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("file", audioBlob, "utterance.webm");

  const response = await fetch(`${trimBase(settings.endpointBase)}/transcribe`, {
    method: "POST",
    body: form,
    signal
  });

  return parseJson<TranscribeResponse>(response);
}

export async function sendChat(
  messages: ConversationMessage[],
  settings: MirrorSettings,
  extraContext = "",
  signal?: AbortSignal,
  evidenceOnly = false
): Promise<ConversationMessage> {
  const recentMessages = messages
    .filter((message) => message.role !== "system")
    .slice(evidenceOnly ? -1 : -HISTORY_WINDOW);

  const response = await fetch(`${trimBase(settings.endpointBase)}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: researchPresenterPrompt(settings) },
        ...(extraContext ? [{ role: "system" as const, content: extraContext }] : []),
        ...recentMessages.map(({ role, content }) => ({ role, content }))
      ],
      model: settings.model,
      stream: false,
      think: false,
      keep_alive: "10m",
      options: {
        num_ctx: 2048,
        num_predict: settings.maxResponseTokens,
        temperature: 0.35,
        repeat_penalty: 1.08
      }
    }),
    signal
  });

  const data = await parseJson<ChatResponse>(response);
  const content = sanitizeAssistantText(
    data.message?.content ?? data.text ?? data.response ?? "",
    settings.maxSpeechChars
  );

  if (!content.trim()) {
    throw new Error("Chat response did not include assistant text.");
  }

  return {
    id: data.message?.id ?? crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: data.message?.createdAt ?? new Date().toISOString()
  };
}

export async function speakText(
  text: string,
  settings: MirrorSettings,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch(`${trimBase(settings.endpointBase)}/speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      voice: settings.voice
    }),
    signal
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Speech request failed with ${response.status}`);
  }

  return response.blob();
}

export async function cacheSpeech(
  text: string,
  settings: MirrorSettings,
  signal?: AbortSignal
): Promise<SpeechCacheResponse> {
  const response = await fetch(`${trimBase(settings.endpointBase)}/speech/cache`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      voice: settings.voice
    }),
    signal
  });

  return parseJson<SpeechCacheResponse>(response);
}

export async function fetchApiAssetBlob(
  assetUrl: string,
  settings: MirrorSettings,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch(resolveApiAssetUrl(assetUrl, settings), { signal });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Asset request failed with ${response.status}`);
  }

  return response.blob();
}

export async function controlSlide(
  action: SlideAction,
  settings: MirrorSettings,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${trimBase(settings.endpointBase)}/slides/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action }),
    signal
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Slide action failed with ${response.status}`);
  }
}

export async function uploadSlidePdf(
  file: File,
  settings: MirrorSettings,
  signal?: AbortSignal
): Promise<SlideDeck> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${trimBase(settings.endpointBase)}/slides/pdf`, {
    method: "POST",
    body: form,
    signal
  });

  return parseJson<SlideDeck>(response);
}

export async function getSlideDeck(settings: MirrorSettings, signal?: AbortSignal): Promise<SlideDeck> {
  const response = await fetch(`${trimBase(settings.endpointBase)}/slides/deck`, { signal });
  return parseJson<SlideDeck>(response);
}

export async function selectSlideForQuery(
  query: string,
  settings: MirrorSettings,
  signal?: AbortSignal,
  currentPage?: number | null
): Promise<SlideSelectionResponse> {
  const response = await fetch(`${trimBase(settings.endpointBase)}/slides/select`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      auto_show: false,
      top_k: 3,
      current_page: currentPage ?? undefined,
    }),
    signal
  });

  const data = await parseJson<SlideSelectionResponse>(response);
  return {
    selected: data.selected,
    candidates: data.candidates?.length ? data.candidates : [data.selected],
  };
}

