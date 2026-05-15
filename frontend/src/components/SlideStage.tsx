import type { SlideDeck, SlidePageSummary } from "../lib/api";
import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

export type SlideStageMode = "presentation" | "qa";

export interface SlideVideoPlaybackRequest {
  page: number;
  nonce: number;
  mode?: "full" | "segment";
}

export type SlideVideoPlaybackResult = "ended" | "blocked";

interface SlideStageProps {
  deck: SlideDeck;
  activePage: number | null;
  evidenceSlides?: SlidePageSummary[];
  imageUrl: string;
  mode: SlideStageMode;
  videoUrl?: string;
  videoPlaybackRequest?: SlideVideoPlaybackRequest | null;
  onVideoPlaybackFinished?: (result: SlideVideoPlaybackResult) => void;
  onVideoPlaybackLevel?: (level: number) => void;
  qaCountdown?: {
    durationMs: number;
    remainingMs: number;
  };
}

export function SlideStage({
  deck,
  activePage,
  evidenceSlides = [],
  imageUrl,
  mode,
  videoUrl,
  videoPlaybackRequest,
  onVideoPlaybackFinished,
  onVideoPlaybackLevel,
  qaCountdown
}: SlideStageProps) {
  const page =
    deck.pages.find((candidate) => candidate.page === activePage) ?? deck.pages[0] ?? null;
  const pageLabel = page ? `${page.page} / ${deck.pages.length}` : "No deck";
  const primaryEvidence = evidenceSlides[0];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const finishedRequestRef = useRef<number | null>(null);
  const videoAnalyserFrameRef = useRef<number | null>(null);
  const activeCue = useMemo(
    () => deck.video_cues?.find((cue) => cue.page === page?.page) ?? null,
    [deck.video_cues, page?.page]
  );
  const showVideo = mode === "presentation" && Boolean(videoUrl);
  const remainingMs = qaCountdown?.remainingMs ?? 0;
  const isQaActive = remainingMs > 0;
  const progress = qaCountdown ? 1 - remainingMs / qaCountdown.durationMs : 0;
  const countdownStyle = {
    "--qa-progress": `${Math.max(0, Math.min(1, progress)) * 360}deg`,
  } as CSSProperties;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo || !onVideoPlaybackLevel) {
      onVideoPlaybackLevel?.(0);
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(video);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      onVideoPlaybackLevel(Math.min(1, average / 128));
      videoAnalyserFrameRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      void context.resume();
      tick();
    };
    const stop = () => {
      if (videoAnalyserFrameRef.current) {
        cancelAnimationFrame(videoAnalyserFrameRef.current);
        videoAnalyserFrameRef.current = null;
      }
      onVideoPlaybackLevel(0);
    };

    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    if (!video.paused) {
      start();
    }

    return () => {
      stop();
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [onVideoPlaybackLevel, showVideo, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo || !activeCue || videoPlaybackRequest) {
      return;
    }
    if (Math.abs(video.currentTime - activeCue.start_sec) > 0.4) {
      video.currentTime = activeCue.start_sec;
    }
    video.pause();
  }, [activeCue, showVideo, videoPlaybackRequest]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo || !videoPlaybackRequest) {
      return;
    }
    const cue = deck.video_cues?.find((candidate) => candidate.page === videoPlaybackRequest.page) ?? null;
    const isFullPlayback = videoPlaybackRequest.mode === "full";
    if (!cue && !isFullPlayback && videoPlaybackRequest.page !== (deck.pages[0]?.page ?? 1)) {
      return;
    }
    finishedRequestRef.current = null;
    video.currentTime = isFullPlayback ? 0 : cue?.start_sec ?? 0;
    void video.play().catch(() => {
      onVideoPlaybackFinished?.("blocked");
    });
  }, [deck.video_cues, onVideoPlaybackFinished, showVideo, videoPlaybackRequest]);

  const finishVideoRequest = (result: SlideVideoPlaybackResult = "ended") => {
    if (!videoPlaybackRequest || finishedRequestRef.current === videoPlaybackRequest.nonce) {
      return;
    }
    finishedRequestRef.current = videoPlaybackRequest.nonce;
    onVideoPlaybackFinished?.(result);
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    const cue = deck.video_cues?.find((candidate) => candidate.page === videoPlaybackRequest?.page) ?? null;
    if (!video || videoPlaybackRequest?.mode === "full" || !cue?.end_sec) {
      return;
    }
    if (video.currentTime >= cue.end_sec) {
      video.pause();
      finishVideoRequest("ended");
    }
  };

  return (
    <section className="slide-stage" aria-label="Slide preview">
      <div className="slide-stage__header">
        <div>
          <p className="eyebrow">Slides</p>
          <h1>{deck.deck_title || deck.filename || "Mirror Presenter"}</h1>
        </div>
        <div className="slide-stage__badges">
          {primaryEvidence ? (
            <span className="slide-stage__evidence">
              Evidence: Slide {primaryEvidence.page}
            </span>
          ) : null}
          <span className="slide-stage__page">{pageLabel}</span>
        </div>
      </div>

      <div className="slide-stage__canvas">
        {showVideo ? (
          <video
            key={videoUrl}
            ref={videoRef}
            className="slide-stage__video"
            src={videoUrl}
            playsInline
            controls
            onEnded={() => finishVideoRequest("ended")}
            onTimeUpdate={handleVideoTimeUpdate}
          />
        ) : deck.pages.length > 0 ? (
          <img
            key={imageUrl}
            alt={`${deck.filename || "Slide deck"} page ${activePage ?? 1}`}
            className="slide-stage__image"
            src={imageUrl}
          />
        ) : (
          <div className="slide-stage__empty">
            <h2>No slide deck loaded</h2>
          </div>
        )}
        {isQaActive ? (
          <div className="slide-stage__qa-overlay" aria-live="polite">
            <div className="slide-stage__qa-ring" style={countdownStyle}>
              <span>{formatCountdown(remainingMs)}</span>
            </div>
            <div>
              <p className="eyebrow">Q&A Time</p>
              <h2>Questions are welcome.</h2>
              <p>Mirror will prioritize audience questions during the remaining Q&A time.</p>
            </div>
          </div>
        ) : null}
      </div>

      <SlideNotes page={page} evidenceSlides={evidenceSlides} />
    </section>
  );
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function SlideNotes({
  page,
  evidenceSlides,
}: {
  page: SlidePageSummary | null;
  evidenceSlides: SlidePageSummary[];
}) {
  if (!page) {
    return null;
  }

  const questions = page.likely_questions?.slice(0, 2) ?? [];
  const secondaryEvidence = evidenceSlides.slice(1, 3);

  return (
    <div className="slide-stage__notes">
      <div>
        <p className="eyebrow">Current</p>
        <h2>{page.title || `Slide ${page.page}`}</h2>
      </div>
      <p>{page.summary || page.short_script || page.spoken_script}</p>
      {questions.length > 0 ? (
        <ul>
          {questions.map((item) => (
            <li key={item.question}>{item.question}</li>
          ))}
        </ul>
      ) : null}
      {secondaryEvidence.length > 0 ? (
        <div className="slide-stage__evidence-list" aria-label="Related evidence slides">
          <span>Related</span>
          {secondaryEvidence.map((slide) => (
            <span key={slide.page}>
              Slide {slide.page}
              {slide.score !== undefined ? ` score ${slide.score}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
