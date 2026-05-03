import type { SlideDeck, SlidePageSummary } from "../lib/api";
import type { CSSProperties } from "react";

interface SlideStageProps {
  deck: SlideDeck;
  activePage: number | null;
  evidenceSlides?: SlidePageSummary[];
  imageUrl: string;
  qaCountdown?: {
    durationMs: number;
    remainingMs: number;
  };
}

export function SlideStage({ deck, activePage, evidenceSlides = [], imageUrl, qaCountdown }: SlideStageProps) {
  const page =
    deck.pages.find((candidate) => candidate.page === activePage) ?? deck.pages[0] ?? null;
  const pageLabel = page ? `${page.page} / ${deck.pages.length}` : "No deck";
  const primaryEvidence = evidenceSlides[0];
  const remainingMs = qaCountdown?.remainingMs ?? 0;
  const isQaActive = remainingMs > 0;
  const progress = qaCountdown ? 1 - remainingMs / qaCountdown.durationMs : 0;
  const countdownStyle = {
    "--qa-progress": `${Math.max(0, Math.min(1, progress)) * 360}deg`,
  } as CSSProperties;

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
        {deck.pages.length > 0 ? (
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
              <h2>質問をどうぞ</h2>
              <p>残り時間の間は質問を優先して回答します。</p>
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
