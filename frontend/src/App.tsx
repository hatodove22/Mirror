import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationPanel, type FlowStatus } from "./components/ConversationPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  SlideStage,
  type SlideStageMode,
  type SlideVideoPlaybackRequest,
  type SlideVideoPlaybackResult
} from "./components/SlideStage";
import { StackChanAvatar } from "./components/StackChanAvatar";
import { createBrowserSpeechRecognition, type BrowserSpeechRecognition } from "./lib/browserSpeech";
import {
  type ConversationMessage,
  type MirrorSettings,
  type SlideDeck,
  type SlidePageSummary,
  type SlideAction,
  cacheSpeech,
  controlSlide,
  fetchApiAssetBlob,
  getSlideDeck,
  getSlidePageImageUrl,
  resolveApiAssetUrl,
  selectSlideForQuery,
  sendChat,
  speakText,
  transcribeAudio,
  uploadSlidePdf
} from "./lib/api";

const FINAL_QA_DURATION_MS = 180_000;

interface AvatarPresenterProps {
  audioLevel: number;
  status: FlowStatus;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
}

type EvidenceSlide = Pick<
  SlidePageSummary,
  "page" | "title" | "summary" | "score" | "keywords" | "evidence_text"
>;

interface LocalSlideVideo {
  url: string;
  name: string;
}

const defaultSettings: MirrorSettings = {
  endpointBase: "/api",
  model: "gemma4:e2b",
  voice: "windows-default",
  maxResponseTokens: 96,
  maxSpeechChars: 260,
  sttMode: "browser",
  language: "auto",
  autoplay: true,
  persistTranscript: false,
  shareMicrophoneAudio: true
};

const makeMessage = (role: ConversationMessage["role"], content: string): ConversationMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: new Date().toISOString()
});

const buildSlideEvidenceContext = (question: string, slides: EvidenceSlide[]) => {
  if (slides.length === 0) {
    return "";
  }

  const evidence = slides
    .map((slide, index) => {
      const keywords = slide.keywords?.length ? `キーワード: ${slide.keywords.join(", ")}` : "";
      return [
        `根拠${index + 1}: ${slide.page}ページ「${slide.title || `Slide ${slide.page}`}」`,
        `要約: ${slide.summary}`,
        slide.evidence_text ? `根拠テキスト: ${slide.evidence_text}` : "",
        keywords,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [
    "Evidence slides retrieved for the user's question follow.",
    "Use only these evidence slides to answer.",
    "If the evidence is insufficient, say so briefly in the response language.",
    `User question: ${question}`,
    evidence,
  ].join("\n\n");
};

const speechRecognitionLang = (language: MirrorSettings["language"]) => {
  if (language === "ja") {
    return "ja-JP";
  }
  if (language === "en") {
    return "en-US";
  }
  const browserLanguage = navigator.language || "ja-JP";
  return browserLanguage.toLowerCase().startsWith("en") ? "en-US" : "ja-JP";
};

const presentationVideoLanguage = (language: MirrorSettings["language"]): "ja" | "en" => {
  if (language === "en") {
    return "en";
  }
  if (language === "ja") {
    return "ja";
  }
  return (navigator.language || "ja-JP").toLowerCase().startsWith("en") ? "en" : "ja";
};

const hasPreparedVideo = (deck: SlideDeck, localVideo?: LocalSlideVideo | null) =>
  Boolean(localVideo?.url || deck.video_url || Object.keys(deck.video_urls ?? {}).length > 0);

const hasPreparedVideoForLanguage = (
  deck: SlideDeck,
  language: "ja" | "en",
  localVideo?: LocalSlideVideo | null
) => Boolean(localVideo?.url || deck.video_urls?.[language] || deck.video_url);

const parseSlideVoiceAction = (text: string): SlideAction | null => {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}。、？！]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = normalized.replace(/\s+/g, "");

  const includesAny = (phrases: string[]) =>
    phrases.some((phrase) => normalized.includes(phrase) || compact.includes(phrase.replace(/\s+/g, "")));

  if (includesAny(["next slide", "go next", "advance slide", "advance", "forward", "next", "次のスライド", "次へ", "次", "進めて", "めくって"])) {
    return "next";
  }
  if (includesAny(["previous slide", "prev slide", "go back", "back slide", "back", "previous", "prev", "前のスライド", "前へ", "戻って", "戻る"])) {
    return "previous";
  }
  if (includesAny(["first slide", "go to first", "beginning", "最初のスライド", "最初", "先頭", "はじめ"])) {
    return "first";
  }
  if (includesAny(["last slide", "final slide", "go to last", "最後のスライド", "最後", "最終"])) {
    return "last";
  }
  if (includesAny(["start slideshow", "start presentation", "begin slideshow", "present slides", "スライドショー開始", "発表開始", "開始して"])) {
    return "start";
  }
  if (includesAny(["stop slideshow", "stop presentation", "end slideshow", "exit slideshow", "スライドショー終了", "発表終了", "終了して"])) {
    return "stop";
  }

  return null;
};

const computeSlidePageFromDeck = (
  pages: SlideDeck["pages"],
  current: number | null,
  action: SlideAction
) => {
  if (pages.length === 0) {
    return current;
  }
  const first = pages[0]?.page ?? null;
  const last = pages[pages.length - 1]?.page ?? first;
  if (action === "start" || action === "first") {
    return first;
  }
  if (action === "last") {
    return last;
  }
  const currentIndex = Math.max(0, pages.findIndex((page) => page.page === current));
  if (action === "next") {
    return pages[Math.min(pages.length - 1, currentIndex + 1)]?.page ?? current;
  }
  if (action === "previous") {
    return pages[Math.max(0, currentIndex - 1)]?.page ?? current;
  }
  return current;
};
export default function App() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [settings, setSettings] = useState<MirrorSettings>(defaultSettings);
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [logs, setLogs] = useState<string[]>(["Frontend ready."]);
  const [error, setError] = useState<string>();
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const [lastAudioUrl, setLastAudioUrl] = useState<string>();
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob>();
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [slideDeck, setSlideDeck] = useState<SlideDeck>({ filename: "", pages: [] });
  const [activeSlidePage, setActiveSlidePage] = useState<number | null>(null);
  const [evidenceSlides, setEvidenceSlides] = useState<EvidenceSlide[]>([]);
  const [evidenceDisplayPage, setEvidenceDisplayPage] = useState<number | null>(null);
  const [qaCountdownUntil, setQaCountdownUntil] = useState<number | null>(null);
  const [qaCountdownRemainingMs, setQaCountdownRemainingMs] = useState(0);
  const [slideStageMode, setSlideStageMode] = useState<SlideStageMode>("presentation");
  const [videoPlaybackRequest, setVideoPlaybackRequest] = useState<SlideVideoPlaybackRequest | null>(null);
  const [localSlideVideo, setLocalSlideVideo] = useState<LocalSlideVideo | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const autoStartedRef = useRef(false);
  const shouldListenRef = useRef(false);
  const liveEnabledRef = useRef(false);
  const busyRef = useRef(false);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const settingsRef = useRef<MirrorSettings>(defaultSettings);
  const lastAudioUrlRef = useRef<string | undefined>(undefined);
  const flowAbortRef = useRef<AbortController | null>(null);
  const flowIdRef = useRef(0);
  const runTextConversationRef = useRef<((text: string, source: "browser" | "backend" | "keyboard") => Promise<void>) | null>(null);
  const activeSlidePageRef = useRef<number | null>(null);
  const slideDeckRef = useRef<SlideDeck>({ filename: "", pages: [] });
  const localSlideVideoRef = useRef<LocalSlideVideo | null>(null);
  const lastUserInteractionAtRef = useRef(Date.now());
  const idleTimerRef = useRef<number | null>(null);
  const evidenceSequenceTimerRef = useRef<number | null>(null);
  const qaCountdownUntilRef = useRef<number | null>(null);
  const videoPlaybackFinishRef = useRef<((result: SlideVideoPlaybackResult) => void) | null>(null);
  const autoPresenterRef = useRef<{ nextPage: number }>({
    nextPage: 1,
  });

  const log = useCallback((entry: string) => {
    setLogs((current) => [
      `${new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date())} ${entry}`,
      ...current
    ].slice(0, 10));
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    localSlideVideoRef.current = localSlideVideo;
  }, [localSlideVideo]);

  useEffect(() => () => {
    if (localSlideVideoRef.current?.url) {
      URL.revokeObjectURL(localSlideVideoRef.current.url);
    }
  }, []);

  useEffect(() => {
    liveEnabledRef.current = liveEnabled;
  }, [liveEnabled]);

  useEffect(() => {
    slideDeckRef.current = slideDeck;
  }, [slideDeck]);

  useEffect(() => {
    activeSlidePageRef.current = activeSlidePage;
  }, [activeSlidePage]);

  useEffect(() => {
    qaCountdownUntilRef.current = qaCountdownUntil;
    if (!qaCountdownUntil) {
      setQaCountdownRemainingMs(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = Math.max(0, qaCountdownUntil - Date.now());
      setQaCountdownRemainingMs(remainingMs);

      if (remainingMs <= 0) {
        const firstPage = slideDeckRef.current.pages[0]?.page ?? 1;
        qaCountdownUntilRef.current = null;
        setQaCountdownUntil(null);
        setSlideStageMode("presentation");
        setVideoPlaybackRequest(null);
        autoPresenterRef.current = { nextPage: firstPage };
        lastUserInteractionAtRef.current = slideDeckRef.current.video_url ? 0 : Date.now();
        log("Final Q&A countdown finished; restarting from the first slide.");
      }
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(timer);
  }, [log, qaCountdownUntil]);

  useEffect(() => {
    lastAudioUrlRef.current = lastAudioUrl;
  }, [lastAudioUrl]);

  const stopAnalyser = useCallback(() => {
    if (analyserFrameRef.current) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    setPlaybackLevel(0);
  }, []);

  const clearEvidenceSequence = useCallback(() => {
    if (evidenceSequenceTimerRef.current) {
      window.clearInterval(evidenceSequenceTimerRef.current);
      evidenceSequenceTimerRef.current = null;
    }
  }, []);

  const playSlideVideo = useCallback(
    (page: number, mode: "full" | "segment" = "segment") =>
      new Promise<SlideVideoPlaybackResult>((resolve) => {
        const deck = slideDeckRef.current;
        const language = presentationVideoLanguage(settingsRef.current.language);
        const cues = deck.video_cues_by_language?.[language] ?? deck.video_cues ?? [];
        const hasSegmentCue = cues.some((cue) => cue.page === page);
        const canPlayWholeVideoFromStart = page === (deck.pages[0]?.page ?? 1) && cues.length === 0;
        const hasVideo = hasPreparedVideoForLanguage(deck, language, localSlideVideoRef.current);
        if (!hasVideo || (mode === "segment" && !hasSegmentCue && !canPlayWholeVideoFromStart)) {
          resolve("blocked");
          return;
        }
        videoPlaybackFinishRef.current = resolve;
        setSlideStageMode("presentation");
        setVideoPlaybackRequest({ page, nonce: Date.now(), mode });
      }),
    []
  );

  const finishSlideVideoPlayback = useCallback((result: SlideVideoPlaybackResult) => {
    const finish = videoPlaybackFinishRef.current;
    videoPlaybackFinishRef.current = null;
    setVideoPlaybackRequest(null);
    finish?.(result);
  }, []);

  const handleVideoPlaybackLevel = useCallback((level: number) => {
    setPlaybackLevel(level);
  }, []);

  const startEvidenceSequence = useCallback(
    (slides: EvidenceSlide[], audio: HTMLAudioElement) => {
      clearEvidenceSequence();
      const pages = slides.map((slide) => slide.page).filter(Boolean);
      if (pages.length === 0) {
        setEvidenceDisplayPage(null);
        return;
      }

      setEvidenceDisplayPage(pages[0]);
      if (pages.length === 1) {
        return;
      }

      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration * 1000
        : pages.length * 4_000;
      const stepMs = Math.max(2_500, Math.min(7_000, durationMs / pages.length));
      let index = 1;
      evidenceSequenceTimerRef.current = window.setInterval(() => {
        setEvidenceDisplayPage(pages[index]);
        index += 1;
        if (index >= pages.length && evidenceSequenceTimerRef.current) {
          window.clearInterval(evidenceSequenceTimerRef.current);
          evidenceSequenceTimerRef.current = null;
        }
      }, stepMs);
    },
    [clearEvidenceSequence]
  );

  const unlockAudio = useCallback(async () => {
    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    await context.resume();

    if (!audioReady) {
      const buffer = context.createBuffer(1, 1, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
      setAudioReady(true);
      log("Audio playback unlocked.");
    }
  }, [audioReady, log]);

  const restartListeningIfNeeded = useCallback(() => {
    if (!shouldListenRef.current || busyRef.current) {
      return;
    }

    window.setTimeout(() => {
      if (!shouldListenRef.current || busyRef.current) {
        return;
      }

      if (settingsRef.current.sttMode === "browser") {
        const recognition = recognitionRef.current;
        if (!recognition || recognitionActiveRef.current) {
          return;
        }

        try {
          recognition.start();
        } catch {
          // Browsers throw if recognition is already starting. The onend handler will retry.
        }
      } else {
        void startBackendAudioWindow();
      }
    }, 350);
  }, []);

  const enterQaTime = useCallback(() => {
    const until = Date.now() + FINAL_QA_DURATION_MS;
    qaCountdownUntilRef.current = until;
    setQaCountdownUntil(until);
    setQaCountdownRemainingMs(FINAL_QA_DURATION_MS);
    setSlideStageMode("qa");
    setVideoPlaybackRequest(null);
    setPlaybackLevel(0);
    setStatus(shouldListenRef.current ? "listening" : "idle");
    lastUserInteractionAtRef.current = Date.now();
    log("Started final Q&A countdown for 3 minutes.");
    restartListeningIfNeeded();
  }, [log, restartListeningIfNeeded]);

  const pauseCaptureForSpeech = useCallback(() => {
    recognitionRef.current?.abort();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const playAudioBlob = useCallback(
    async (audioBlob: Blob, onDone?: () => void, slideSequence: EvidenceSlide[] = []) => {
      if (lastAudioUrlRef.current) {
        URL.revokeObjectURL(lastAudioUrlRef.current);
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      setLastAudioUrl(audioUrl);
      setLastAudioBlob(audioBlob);

      const audio = new Audio(audioUrl);
      audio.volume = 1;
      audioRef.current = audio;

      const context =
        audioContextRef.current ??
        new ((window.AudioContext ??
          (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext) as typeof AudioContext)();
      audioContextRef.current = context;
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(context.destination);

      const samples = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(samples);
        const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
        setPlaybackLevel(Math.min(1, average / 128));
        analyserFrameRef.current = requestAnimationFrame(tick);
      };
      let playbackSettled = false;
      const finishPlayback = (message: string) => {
        if (playbackSettled) {
          return;
        }
        playbackSettled = true;
        clearEvidenceSequence();
        stopAnalyser();
        setStatus(shouldListenRef.current ? "listening" : "idle");
        log(message);
        onDone?.();
      };

      audio.onended = () => {
        finishPlayback("Playback finished.");
      };
      audio.onerror = () => {
        setError("Response audio could not be played.");
        finishPlayback("Response audio playback failed.");
      };

      setStatus("speaking");
      log("Playing response audio.");
      tick();
      await unlockAudio();
      try {
        await audio.play();
        if (slideSequence.length > 0) {
          const startSequence = () => startEvidenceSequence(slideSequence, audio);
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            startSequence();
          } else {
            audio.onloadedmetadata = startSequence;
            window.setTimeout(() => {
              if (!evidenceSequenceTimerRef.current) {
                startSequence();
              }
            }, 600);
          }
        }
      } catch (caught) {
        const message =
          caught instanceof Error
            ? `Browser blocked audio playback: ${caught.message}. Click Replay once to unlock it.`
            : "Browser blocked audio playback. Click Replay once to unlock it.";
        setError(message);
        finishPlayback(message);
      }
    },
    [clearEvidenceSequence, log, startEvidenceSequence, stopAnalyser, unlockAudio]
  );

  const interruptSpeech = useCallback(() => {
    flowIdRef.current += 1;
    flowAbortRef.current?.abort();
    flowAbortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    setVideoPlaybackRequest(null);
    clearEvidenceSequence();
    stopAnalyser();
    busyRef.current = false;
    setStatus(shouldListenRef.current ? "listening" : "idle");
    setTranscriptDraft("");
    log("Interrupted current response.");
    restartListeningIfNeeded();
  }, [clearEvidenceSequence, log, restartListeningIfNeeded, stopAnalyser]);

  const runSlideAction = useCallback(
    async (action: SlideAction, source: "voice" | "button" = "button") => {
      try {
        flowIdRef.current += 1;
        flowAbortRef.current?.abort();
        flowAbortRef.current = null;
        audioRef.current?.pause();
        audioRef.current = null;
        clearEvidenceSequence();
        stopAnalyser();
        busyRef.current = false;
        qaCountdownUntilRef.current = null;
        setQaCountdownUntil(null);
        setQaCountdownRemainingMs(0);
        setEvidenceDisplayPage(null);
        setSlideStageMode("presentation");
        setVideoPlaybackRequest(null);
        setStatus(shouldListenRef.current ? "listening" : "idle");
        await controlSlide(action, settingsRef.current);
        const nextPage = computeSlidePageFromDeck(slideDeckRef.current.pages, activeSlidePageRef.current, action);
        activeSlidePageRef.current = nextPage;
        setActiveSlidePage(nextPage);
        setEvidenceSlides([]);
        setEvidenceDisplayPage(null);
        autoPresenterRef.current = {
          nextPage: nextPage ?? autoPresenterRef.current.nextPage,
        };
        setTranscriptDraft("");
        log(`${source === "voice" ? "Voice slide action" : "Slide action"}: ${action}`);
        const deck = slideDeckRef.current;
        const firstPage = deck.pages[0]?.page ?? 1;
        const canPlayPreparedVideo = hasPreparedVideo(deck, localSlideVideoRef.current);
        if (action === "start" && canPlayPreparedVideo) {
          const flowId = ++flowIdRef.current;
          busyRef.current = true;
          pauseCaptureForSpeech();
          setError(undefined);
          setStatus("speaking");
          setPlaybackLevel(0.12);
          activeSlidePageRef.current = firstPage;
          setActiveSlidePage(firstPage);
          log("Restarting prepared slide video from the beginning.");
          const result = await playSlideVideo(firstPage, "full");
          if (flowId === flowIdRef.current) {
            setPlaybackLevel(0);
            busyRef.current = false;
            if (result === "ended") {
              enterQaTime();
            } else {
              setStatus(shouldListenRef.current ? "listening" : "idle");
              log("Video autoplay was blocked; waiting for Start after a browser gesture.");
              restartListeningIfNeeded();
            }
          }
          return;
        }
        lastUserInteractionAtRef.current = Date.now();
        restartListeningIfNeeded();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Slide action failed.";
        busyRef.current = false;
        setError(message);
        setStatus("error");
        log(message);
        restartListeningIfNeeded();
      }
    },
    [clearEvidenceSequence, enterQaTime, log, pauseCaptureForSpeech, playSlideVideo, restartListeningIfNeeded, stopAnalyser]
  );

  const runTextConversation = useCallback(
    async (text: string, source: "browser" | "backend" | "keyboard") => {
      const cleanText = text.trim();
      if (!cleanText) {
        restartListeningIfNeeded();
        return;
      }

      const slideAction = parseSlideVoiceAction(cleanText);
      if (slideAction) {
        setTranscriptDraft(cleanText);
        log(source === "keyboard" ? `Typed slide command: ${cleanText}` : `Recognized slide command via ${source}: ${cleanText}`);
        await runSlideAction(slideAction, "voice");
        return;
      }

      lastUserInteractionAtRef.current = Date.now();

      try {
        const flowId = ++flowIdRef.current;
        flowAbortRef.current?.abort();
        audioRef.current?.pause();
        audioRef.current = null;
        stopAnalyser();
        pauseCaptureForSpeech();
        const abortController = new AbortController();
        flowAbortRef.current = abortController;
        busyRef.current = true;
        setError(undefined);
        setTranscriptDraft(cleanText);
        setStatus("thinking");
        log(source === "keyboard" ? `Typed: ${cleanText}` : `Recognized via ${source}: ${cleanText}`);

        const userMessage = makeMessage("user", cleanText);
        const nextMessages = [...messagesRef.current, userMessage];
        messagesRef.current = nextMessages;
        setMessages(nextMessages);

        let slideContext = "";
        let hasSlideEvidence = false;
        let currentEvidence: EvidenceSlide[] = [];
        const deckPages = slideDeckRef.current.pages;
        if (deckPages.length > 0) {
          const selection = await selectSlideForQuery(
            cleanText,
            settingsRef.current,
            abortController.signal,
            activeSlidePageRef.current
          );
          const selectedSlide = selection.selected;
          const evidence = selection.candidates.slice(0, 3);
          currentEvidence = evidence;
          hasSlideEvidence = evidence.length > 0;
          setEvidenceSlides(evidence);
          setEvidenceDisplayPage(evidence[0]?.page ?? selectedSlide.page);
          setSlideStageMode("qa");
          setVideoPlaybackRequest(null);
          activeSlidePageRef.current = selectedSlide.page;
          setActiveSlidePage(selectedSlide.page);
          autoPresenterRef.current = {
            nextPage: selectedSlide.page,
          };
          slideContext = buildSlideEvidenceContext(cleanText, evidence);
          log(
            `Selected evidence slides: ${evidence
              .map((slide) => `${slide.page}${slide.score !== undefined ? ` (${slide.score})` : ""}`)
              .join(", ")}`
          );
        }

        const assistantMessage = await sendChat(
          nextMessages,
          settingsRef.current,
          slideContext,
          abortController.signal,
          hasSlideEvidence
        );
        if (flowId !== flowIdRef.current) {
          return;
        }
        messagesRef.current = [...nextMessages, assistantMessage];
        setMessages(messagesRef.current);
        setTranscriptDraft("");

        if (settingsRef.current.autoplay) {
          let speechBlob: Blob;
          try {
            const speechCache = await cacheSpeech(
              assistantMessage.content,
              settingsRef.current,
              abortController.signal
            );
            if (flowId !== flowIdRef.current) {
              return;
            }

            speechBlob = await fetchApiAssetBlob(
              speechCache.audio_url,
              settingsRef.current,
              abortController.signal
            );
          } catch (caught) {
            if (caught instanceof DOMException && caught.name === "AbortError") {
              return;
            }
            const message = caught instanceof Error ? caught.message : "Speech cache failed.";
            log(`Speech cache unavailable, using direct TTS: ${message}`);
            speechBlob = await speakText(
              assistantMessage.content,
              settingsRef.current,
              abortController.signal
            );
          }

          if (flowId !== flowIdRef.current) {
            return;
          }
          await playAudioBlob(speechBlob, () => {
            busyRef.current = false;
            abortController.abort();
            flowAbortRef.current = null;
            restartListeningIfNeeded();
          }, currentEvidence);
        } else {
          busyRef.current = false;
          flowAbortRef.current = null;
          setStatus(shouldListenRef.current ? "listening" : "idle");
          restartListeningIfNeeded();
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Conversation flow failed.";
        busyRef.current = false;
        flowAbortRef.current = null;
        setError(message);
        setStatus("error");
        log(message);
        restartListeningIfNeeded();
      }
    },
    [log, pauseCaptureForSpeech, playAudioBlob, restartListeningIfNeeded, runSlideAction, stopAnalyser]
  );

  useEffect(() => {
    runTextConversationRef.current = runTextConversation;
  }, [runTextConversation]);

  const runAudioConversation = useCallback(
    async (audioBlob: Blob) => {
      if (!settingsRef.current.shareMicrophoneAudio) {
        setError("Microphone sharing is disabled in Privacy.");
        setStatus(shouldListenRef.current ? "listening" : "idle");
        log("Blocked transcription because microphone sharing is off.");
        restartListeningIfNeeded();
        return;
      }

      try {
        const flowId = ++flowIdRef.current;
        flowAbortRef.current?.abort();
        const abortController = new AbortController();
        flowAbortRef.current = abortController;
        busyRef.current = true;
        setError(undefined);
        setStatus("transcribing");
        log("Sending audio window for local transcription.");
        const transcription = await transcribeAudio(audioBlob, settingsRef.current, abortController.signal);
        if (flowId !== flowIdRef.current) {
          return;
        }
        busyRef.current = false;
        flowAbortRef.current = null;

        if (!transcription.text.trim()) {
          log(transcription.message ?? "No speech was detected in the audio window.");
          setStatus(shouldListenRef.current ? "listening" : "idle");
          restartListeningIfNeeded();
          return;
        }

        await runTextConversation(transcription.text, "backend");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          busyRef.current = false;
          flowAbortRef.current = null;
          setStatus(shouldListenRef.current ? "listening" : "idle");
          restartListeningIfNeeded();
          return;
        }
        const message = caught instanceof Error ? caught.message : "Transcription failed.";
        busyRef.current = false;
        flowAbortRef.current = null;
        setError(message);
        setStatus("error");
        log(message);
        restartListeningIfNeeded();
      }
    },
    [log, restartListeningIfNeeded, runTextConversation]
  );

  const configureBrowserRecognition = useCallback(() => {
    const recognition = createBrowserSpeechRecognition(speechRecognitionLang(settingsRef.current.language));
    if (!recognition) {
      return null;
    }

    recognition.onstart = () => {
      recognitionActiveRef.current = true;
      setStatus("listening");
      log("Continuous browser speech recognition is listening.");
    };

    recognition.onend = () => {
      recognitionActiveRef.current = false;
      if (!busyRef.current) {
        setStatus(shouldListenRef.current ? "listening" : "idle");
      }
      restartListeningIfNeeded();
    };

    recognition.onerror = (event) => {
      recognitionActiveRef.current = false;
      if (event.error === "no-speech" || event.error === "aborted") {
        restartListeningIfNeeded();
        return;
      }

      const message = event.message || `Speech recognition error: ${event.error}`;
      setError(message);
      log(message);

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setLiveEnabled(false);
        setStatus("error");
      } else {
        restartListeningIfNeeded();
      }
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      setTranscriptDraft((finalText || interim).trim());

      if (finalText.trim()) {
        recognition.stop();
        void runTextConversationRef.current?.(finalText, "browser");
      }
    };

    return recognition;
  }, [log, restartListeningIfNeeded]);

  async function startBackendAudioWindow() {
    if (!shouldListenRef.current || busyRef.current || recorderRef.current?.state === "recording") {
      return;
    }

    try {
      const stream =
        streamRef.current ??
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        }));
      streamRef.current = stream;
      chunksRef.current = [];

      const recorderOptions = MediaRecorder.isTypeSupported("audio/webm")
        ? { mimeType: "audio/webm" }
        : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (shouldListenRef.current && audioBlob.size > 0) {
          void runAudioConversation(audioBlob);
        }
      };

      recorder.start();
      setStatus("listening");
      log("Backend STT window started.");
      window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 4500);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not access microphone.";
      setError(message);
      setStatus("error");
      setLiveEnabled(false);
      shouldListenRef.current = false;
      log(message);
    }
  }

  const startLiveConversation = useCallback(async () => {
    setError(undefined);
    void unlockAudio();
    setLiveEnabled(true);
    shouldListenRef.current = true;

    if (settingsRef.current.sttMode === "browser") {
      recognitionRef.current ??= configureBrowserRecognition();
      if (!recognitionRef.current) {
        setError("This browser does not expose continuous speech recognition. Switch STT mode to Backend Whisper.");
        setLiveEnabled(false);
        shouldListenRef.current = false;
        return;
      }
    }

    restartListeningIfNeeded();
  }, [configureBrowserRecognition, restartListeningIfNeeded, unlockAudio]);

  const pauseLiveConversation = useCallback(() => {
    shouldListenRef.current = false;
    setLiveEnabled(false);
    recognitionRef.current?.abort();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus("idle");
    log("Live conversation paused.");
  }, [log]);

  const handleLiveToggle = useCallback(() => {
    if (liveEnabled) {
      pauseLiveConversation();
    } else {
      void startLiveConversation();
    }
  }, [liveEnabled, pauseLiveConversation, startLiveConversation]);

  const handleReplay = useCallback(() => {
    if (!lastAudioBlob) {
      return;
    }

    busyRef.current = true;
    void unlockAudio().then(() => playAudioBlob(lastAudioBlob, () => {
      busyRef.current = false;
      restartListeningIfNeeded();
    }));
  }, [lastAudioBlob, playAudioBlob, restartListeningIfNeeded, unlockAudio]);

  const handleTextSubmit = useCallback(
    (text: string) => {
      void unlockAudio().finally(() => {
        void runTextConversation(text, "keyboard");
      });
    },
    [runTextConversation, unlockAudio]
  );

  const handleSlidePdfUpload = useCallback(
    async (file: File) => {
      try {
        const deck = await uploadSlidePdf(file, settingsRef.current);
        setSlideDeck(deck);
        setActiveSlidePage(deck.pages[0]?.page ?? null);
        setEvidenceSlides([]);
        setEvidenceDisplayPage(null);
        setSlideStageMode("presentation");
        setVideoPlaybackRequest(null);
        qaCountdownUntilRef.current = null;
        setQaCountdownUntil(null);
        setQaCountdownRemainingMs(0);
        autoPresenterRef.current = {
          nextPage: deck.pages[0]?.page ?? 1,
        };
        lastUserInteractionAtRef.current = hasPreparedVideo(deck, localSlideVideoRef.current) ? 0 : Date.now();
        log(`Loaded PDF slides: ${deck.filename} (${deck.pages.length} pages).`);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "PDF slide import failed.";
        setError(message);
        log(message);
      }
    },
    [log]
  );

  const handleSlideVideoSelect = useCallback(
    (file: File) => {
      const previousUrl = localSlideVideoRef.current?.url;
      const nextVideo = {
        url: URL.createObjectURL(file),
        name: file.name,
      };
      localSlideVideoRef.current = nextVideo;
      setLocalSlideVideo(nextVideo);
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      setSlideStageMode("presentation");
      setVideoPlaybackRequest(null);
      lastUserInteractionAtRef.current = 0;
      log(`Selected presentation video: ${file.name}.`);
    },
    [log]
  );

  const handleSlideVideoClear = useCallback(() => {
    const previousUrl = localSlideVideoRef.current?.url;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    localSlideVideoRef.current = null;
    setLocalSlideVideo(null);
    setVideoPlaybackRequest(null);
    lastUserInteractionAtRef.current = hasPreparedVideo(slideDeckRef.current, null) ? 0 : Date.now();
    log("Cleared selected presentation video.");
  }, [log]);

  useEffect(() => {
    const abortController = new AbortController();
    void getSlideDeck(settingsRef.current, abortController.signal)
      .then((deck) => {
        if (deck.pages.length === 0) {
          return;
        }
        setSlideDeck(deck);
        setActiveSlidePage(deck.pages[0]?.page ?? null);
        setEvidenceSlides([]);
        setEvidenceDisplayPage(null);
        setSlideStageMode("presentation");
        setVideoPlaybackRequest(null);
        qaCountdownUntilRef.current = null;
        setQaCountdownUntil(null);
        setQaCountdownRemainingMs(0);
        autoPresenterRef.current = {
          nextPage: deck.pages[0]?.page ?? 1,
        };
        lastUserInteractionAtRef.current = hasPreparedVideo(deck, localSlideVideoRef.current) ? 0 : Date.now();
        const source = deck.source ? ` from ${deck.source}` : "";
        log(`Loaded default slides${source}: ${deck.filename} (${deck.pages.length} pages).`);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Default slide deck load failed.";
        log(message);
      });

    return () => abortController.abort();
  }, [log]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setEvidenceSlides([]);
    setEvidenceDisplayPage(null);
    setTranscriptDraft("");
    setError(undefined);
    setStatus(shouldListenRef.current ? "listening" : "idle");
    log("Conversation reset.");
  }, [log]);

  const startFinalQaCountdown = useCallback(() => {
    enterQaTime();
  }, [enterQaTime]);

  const playPreparedNarration = useCallback(async (
    narration: string,
    label: string,
    slidePage?: number,
    options?: { onPlaybackFinished?: () => void }
  ) => {
    try {
      const flowId = ++flowIdRef.current;
      flowAbortRef.current?.abort();
      const abortController = new AbortController();
      flowAbortRef.current = abortController;
      pauseCaptureForSpeech();
      busyRef.current = true;
      setError(undefined);
      setTranscriptDraft("");
      setStatus("thinking");
      if (slidePage) {
        activeSlidePageRef.current = slidePage;
        setActiveSlidePage(slidePage);
      }
      log(label);

      const assistantMessage = makeMessage("assistant", narration);
      messagesRef.current = [...messagesRef.current, assistantMessage];
      setMessages(messagesRef.current);

      const videoLanguage = presentationVideoLanguage(settingsRef.current.language);
      const videoCues = slideDeckRef.current.video_cues_by_language?.[videoLanguage] ?? slideDeckRef.current.video_cues ?? [];
      const canPlayPreparedVideo = hasPreparedVideoForLanguage(
        slideDeckRef.current,
        videoLanguage,
        localSlideVideoRef.current
      );
      if (slidePage && canPlayPreparedVideo) {
        const hasSegmentCue = videoCues.some((cue) => cue.page === slidePage);
        const videoMode = hasSegmentCue ? "segment" : "full";
        const videoPage = hasSegmentCue ? slidePage : slideDeckRef.current.pages[0]?.page ?? slidePage;
        setStatus("speaking");
        setPlaybackLevel(0.16);
        log("Playing prepared slide video.");
        const result = await playSlideVideo(videoPage, videoMode);
        if (flowId !== flowIdRef.current) {
          return;
        }
        setPlaybackLevel(0);
        setStatus(shouldListenRef.current ? "listening" : "idle");
        lastUserInteractionAtRef.current = Date.now();
        busyRef.current = false;
        abortController.abort();
        flowAbortRef.current = null;
        if (result === "ended") {
          options?.onPlaybackFinished?.();
        } else {
          log("Video autoplay was blocked; skipped slide narration fallback because the video contains the narration audio.");
        }
        restartListeningIfNeeded();
        return;
      }

      const speechCache = await cacheSpeech(narration, settingsRef.current, abortController.signal);
      if (flowId !== flowIdRef.current) {
        return;
      }

      const speechBlob = await fetchApiAssetBlob(
        speechCache.audio_url,
        settingsRef.current,
        abortController.signal
      );

      if (flowId !== flowIdRef.current) {
        return;
      }

      await playAudioBlob(speechBlob, () => {
        lastUserInteractionAtRef.current = Date.now();
        busyRef.current = false;
        abortController.abort();
        flowAbortRef.current = null;
        options?.onPlaybackFinished?.();
        restartListeningIfNeeded();
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      const message = caught instanceof Error ? caught.message : "Slide narration failed.";
      busyRef.current = false;
      flowAbortRef.current = null;
      setError(message);
      setStatus("error");
      log(message);
      restartListeningIfNeeded();
    }
  }, [
    log,
    pauseCaptureForSpeech,
    playAudioBlob,
    playSlideVideo,
    restartListeningIfNeeded,
  ]);

  const explainActiveSlide = useCallback(async () => {
    const slide =
      slideDeck.pages.find((page) => page.page === activeSlidePage) ?? slideDeck.pages[0];
    const narration = (slide?.short_script || slide?.spoken_script || slide?.summary || "").trim();
    if (!slide || !narration) {
      setError("No prepared narration is available for the current slide.");
      log("No prepared slide narration was available.");
      return;
    }

    await playPreparedNarration(narration, `Explaining slide ${slide.page}: ${slide.title}`, slide.page);
  }, [activeSlidePage, log, playPreparedNarration, slideDeck.pages]);

  const handleSlideAction = useCallback(
    async (action: SlideAction) => {
      await runSlideAction(action, "button");
    },
    [runSlideAction]
  );

  const runIdlePresenterStep = useCallback(async () => {
    const deck = slideDeckRef.current;
    if (busyRef.current || deck.pages.length === 0) {
      return;
    }
    const canPlayPreparedVideo = hasPreparedVideo(deck, localSlideVideoRef.current);
    if (!liveEnabledRef.current && !canPlayPreparedVideo) {
      return;
    }
    if (qaCountdownUntilRef.current && qaCountdownUntilRef.current > Date.now()) {
      return;
    }

    const pages = deck.pages;
    const firstPage = pages[0]?.page ?? 1;
    if (canPlayPreparedVideo) {
      const flowId = ++flowIdRef.current;
      flowAbortRef.current?.abort();
      flowAbortRef.current = new AbortController();
      audioRef.current?.pause();
      audioRef.current = null;
      clearEvidenceSequence();
      stopAnalyser();
      pauseCaptureForSpeech();
      busyRef.current = true;
      setError(undefined);
      setTranscriptDraft("");
      setEvidenceSlides([]);
      setEvidenceDisplayPage(null);
      setSlideStageMode("presentation");
      activeSlidePageRef.current = firstPage;
      setActiveSlidePage(firstPage);
      setStatus("speaking");
      setPlaybackLevel(0.12);
      log("Playing prepared slide video.");
      const result = await playSlideVideo(firstPage, "full");
      if (flowId !== flowIdRef.current) {
        return;
      }
      setPlaybackLevel(0);
      busyRef.current = false;
      flowAbortRef.current?.abort();
      flowAbortRef.current = null;
      if (result === "ended") {
        enterQaTime();
      } else {
        setStatus(shouldListenRef.current ? "listening" : "idle");
        lastUserInteractionAtRef.current = Date.now();
        log("Video autoplay was blocked; presentation is waiting for Start after a browser gesture.");
        restartListeningIfNeeded();
      }
      return;
    }

    if (Date.now() - lastUserInteractionAtRef.current < 12_000) {
      return;
    }

    const lastPage = pages[pages.length - 1]?.page ?? firstPage;
    const autoPage =
      pages.find((candidate) => candidate.page === autoPresenterRef.current.nextPage) ??
      pages.find((candidate) => candidate.page === activeSlidePageRef.current) ??
      pages[0];
    if (!autoPage) {
      return;
    }

    const autoNarration = (autoPage.short_script || autoPage.spoken_script || autoPage.summary || "").trim();
    const isLastPage = autoPage.page === lastPage;
    autoPresenterRef.current.nextPage = isLastPage
      ? firstPage
      : computeSlidePageFromDeck(pages, autoPage.page, "next") ?? autoPage.page;
    if (!autoNarration) {
      if (isLastPage) {
        startFinalQaCountdown();
      }
      return;
    }

    lastUserInteractionAtRef.current = Date.now();
    setEvidenceSlides([]);
    setEvidenceDisplayPage(null);
    await playPreparedNarration(
      autoNarration,
      `Auto explaining slide ${autoPage.page}: ${autoPage.title}`,
      autoPage.page,
      {
        onPlaybackFinished: isLastPage
          ? startFinalQaCountdown
          : () => {
              lastUserInteractionAtRef.current = 0;
            },
      }
    );
    return;
  }, [
    clearEvidenceSequence,
    log,
    pauseCaptureForSpeech,
    playPreparedNarration,
    playSlideVideo,
    enterQaTime,
    restartListeningIfNeeded,
    startFinalQaCountdown,
    stopAnalyser,
  ]);

  const handleSettingsChange = useCallback(
    (nextSettings: MirrorSettings) => {
      const sttModeChanged = nextSettings.sttMode !== settingsRef.current.sttMode;
      const languageChanged = nextSettings.language !== settingsRef.current.language;
      const shouldRestartPresentationVideo =
        languageChanged &&
        slideStageMode === "presentation" &&
        Boolean(videoPlaybackRequest) &&
        hasPreparedVideo(slideDeckRef.current, localSlideVideoRef.current);
      settingsRef.current = nextSettings;
      setSettings(nextSettings);

      if (shouldRestartPresentationVideo) {
        finishSlideVideoPlayback("blocked");
        busyRef.current = false;
        flowAbortRef.current?.abort();
        flowAbortRef.current = null;
        setPlaybackLevel(0);
        setStatus("idle");
        lastUserInteractionAtRef.current = 0;
        log("Language changed; restarting prepared slide video.");
      }

      if ((sttModeChanged || languageChanged) && shouldListenRef.current) {
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
        restartListeningIfNeeded();
      }
    },
    [finishSlideVideoPlayback, log, restartListeningIfNeeded, slideStageMode, videoPlaybackRequest]
  );

  useEffect(() => {
    if (autoStartedRef.current) {
      return;
    }

    autoStartedRef.current = true;
    void startLiveConversation();
  }, [startLiveConversation]);

  useEffect(() => {
    if (idleTimerRef.current) {
      window.clearInterval(idleTimerRef.current);
    }
    idleTimerRef.current = window.setInterval(() => {
      void runIdlePresenterStep();
    }, 2_000);

    return () => {
      if (idleTimerRef.current) {
        window.clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [runIdlePresenterStep]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.abort();
      clearEvidenceSequence();
      stopAnalyser();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (lastAudioUrlRef.current) {
        URL.revokeObjectURL(lastAudioUrlRef.current);
      }
    };
  }, [clearEvidenceSequence, stopAnalyser]);

  const avatarProps = useMemo<AvatarPresenterProps>(
    () => ({
      audioLevel: playbackLevel,
      status,
      isListening: status === "listening",
      isSpeaking: status === "speaking",
      transcript: transcriptDraft
    }),
    [playbackLevel, status, transcriptDraft]
  );
  const isQuestionWaiting =
    qaCountdownRemainingMs > 0 && status !== "thinking" && status !== "speaking" && status !== "transcribing";

  const displayedSlidePage = evidenceDisplayPage ?? evidenceSlides[0]?.page ?? activeSlidePage;
  const slideImageUrl = useMemo(
    () => getSlidePageImageUrl(settings, displayedSlidePage ?? 1),
    [displayedSlidePage, settings]
  );
  const videoLanguage = useMemo(() => presentationVideoLanguage(settings.language), [settings.language]);
  const activeVideoCues = useMemo(
    () => slideDeck.video_cues_by_language?.[videoLanguage] ?? slideDeck.video_cues ?? [],
    [slideDeck.video_cues, slideDeck.video_cues_by_language, videoLanguage]
  );
  const slideVideoUrl = useMemo(
    () => {
      const url = localSlideVideo?.url ?? slideDeck.video_urls?.[videoLanguage] ?? slideDeck.video_url;
      return url ? resolveApiAssetUrl(url, settings) : undefined;
    },
    [localSlideVideo, settings, slideDeck.video_url, slideDeck.video_urls, videoLanguage]
  );
  const displaySlideDeck = useMemo(
    () => ({ ...slideDeck, video_cues: activeVideoCues }),
    [activeVideoCues, slideDeck]
  );

  useEffect(() => {
    if (slideDeck.pages.length === 0) {
      return;
    }

    const pages = slideDeck.pages.map((page) => page.page);
    const activeIndex = Math.max(0, pages.findIndex((page) => page === (displayedSlidePage ?? pages[0])));
    const pagesToPreload = new Set([
      pages[activeIndex],
      pages[Math.max(0, activeIndex - 1)],
      pages[Math.min(pages.length - 1, activeIndex + 1)],
      pages[Math.min(pages.length - 1, activeIndex + 2)],
      evidenceDisplayPage,
      ...evidenceSlides.map((slide) => slide.page),
    ].filter((page): page is number => typeof page === "number" && page > 0));

    const images = Array.from(pagesToPreload)
      .filter(Boolean)
      .map((page) => {
        const image = new Image();
        image.decoding = "async";
        image.src = getSlidePageImageUrl(settings, page);
        return image;
      });

    return () => {
      images.forEach((image) => {
        image.src = "";
      });
    };
  }, [displayedSlidePage, evidenceDisplayPage, evidenceSlides, settings, slideDeck.pages]);

  return (
    <main className="app-shell" onPointerDownCapture={() => void unlockAudio()}>
      <ConversationPanel
        messages={messages}
        status={status}
        transcriptDraft={transcriptDraft}
        error={error}
        liveEnabled={liveEnabled}
        canReplay={Boolean(lastAudioBlob)}
        canInterrupt={status === "thinking" || status === "speaking" || status === "transcribing"}
        onLiveToggle={handleLiveToggle}
        onReplay={handleReplay}
        onInterrupt={interruptSpeech}
        onTextSubmit={handleTextSubmit}
      />

      <div
        className="presentation-host"
        data-question-waiting={isQuestionWaiting ? "true" : "false"}
        data-status={avatarProps.status}
      >
        <SlideStage
          activePage={displayedSlidePage}
          deck={displaySlideDeck}
          evidenceSlides={evidenceSlides}
          imageUrl={slideImageUrl}
          mode={slideStageMode}
          videoUrl={slideVideoUrl}
          videoPlaybackRequest={videoPlaybackRequest}
          onVideoPlaybackFinished={finishSlideVideoPlayback}
          onVideoPlaybackLevel={handleVideoPlaybackLevel}
          qaCountdown={{
            durationMs: FINAL_QA_DURATION_MS,
            remainingMs: qaCountdownRemainingMs,
          }}
        />
        {isQuestionWaiting ? (
          <div className="qa-avatar-center" aria-live="polite">
            <div className="qa-avatar-center__bubble">質問待機中です。どうぞ質問してください。</div>
            <StackChanAvatar
              audioLevel={0.18}
              status="listening"
              isListening
              isSpeaking={false}
            />
          </div>
        ) : null}
        <div className="avatar-pip">
          <StackChanAvatar
            audioLevel={avatarProps.audioLevel}
            status={avatarProps.status}
            isListening={avatarProps.isListening}
            isSpeaking={avatarProps.isSpeaking}
          />
        </div>
        <div className="avatar-status" aria-live="polite">
          <span>
            {avatarProps.isListening ? "Listening" : avatarProps.isSpeaking ? "Speaking" : "Ready"}
          </span>
          <p>{avatarProps.transcript || "Live conversation is armed."}</p>
        </div>
      </div>

      <SettingsPanel
        settings={settings}
        level={playbackLevel}
        logs={logs}
        slideDeck={slideDeck}
        activeSlidePage={activeSlidePage}
        selectedSlideVideoName={localSlideVideo?.name}
        onSettingsChange={handleSettingsChange}
        onResetConversation={resetConversation}
        onSlideAction={handleSlideAction}
        onExplainSlide={explainActiveSlide}
        onSlidePdfUpload={handleSlidePdfUpload}
        onSlideVideoSelect={handleSlideVideoSelect}
        onSlideVideoClear={handleSlideVideoClear}
      />
    </main>
  );
}

