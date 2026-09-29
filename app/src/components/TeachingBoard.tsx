"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  parseMarkdownTable,
  hasVisibleBoardContent,
  type BoardContent,
  type BoardHighlight,
  type BoardMarker,
} from "@/lib/board";
// TEMPORARY PROOF-OF-CONCEPT import — see src/data/lessons/lesson1-numbers.ts's module doc.
import { LessonComponentView } from "@/components/lesson/LessonComponents";
import AnimatedAbacus from "@/components/AnimatedAbacus";
import { t } from "@/lib/appCopy";

// How long the fade-out half of a content swap takes before the new content
// swaps in and fades back in — keeps board updates feeling like a smooth
// transition rather than a jarring flash/replace.
const CROSSFADE_MS = 200;

export interface TeachingBoardProps {
  content: BoardContent | null;
  /**
   * Called whenever the child directly manipulates the board (tap-to-zoom,
   * pinch, manual table scroll) — see PART B in useGeminiLive.ts: this
   * becomes the new authoritative state, surfaced back to the model on its
   * next board action so it doesn't immediately override what the child
   * just did.
   */
  onManualInteraction?: () => void;
  /** TEMPORARY PROOF-OF-CONCEPT — see src/data/lessons/lesson1-numbers.ts's module doc. */
  onSubmitTypedAnswer?: (value: string) => void;
}

/**
 * "The board" — a visual teaching area alongside the voice UI, showing
 * whatever the model's most recent show_* tool call produced: a real
 * textbook page image, a data table, a practice exercise, or a vocabulary
 * card — plus AI-controlled view actions (zoom, page navigation, table
 * scroll, highlight) and the child's own manual taps/pinches/scrolls on top
 * of that. See src/lib/board.ts for the content shape and
 * src/hooks/useGeminiLive.ts for how tool calls populate it.
 */
export default function TeachingBoard({ content, onManualInteraction, onSubmitTypedAnswer }: TeachingBoardProps) {
  const [displayed, setDisplayed] = useState<BoardContent | null>(content);
  const [fadedIn, setFadedIn] = useState(true);
  const [prevContent, setPrevContent] = useState<BoardContent | null>(content);

  // Start the fade-out the instant new content arrives, adjusted during
  // render (React's recommended pattern for "state that depends on a prop
  // change") rather than a synchronous setState call inside an effect body.
  if (content !== prevContent) {
    setPrevContent(content);
    setFadedIn(false);
  }

  // The actual delayed swap-in is a genuine async effect: re-running on
  // every content change (not just when faded out) means a second change
  // arriving mid-fade cancels the stale timer via cleanup and schedules a
  // fresh one, so `displayed` always ends up settling on the latest value.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDisplayed(content);
      setFadedIn(true);
    }, CROSSFADE_MS);
    return () => clearTimeout(timeout);
  }, [content]);

  const hasContent = hasVisibleBoardContent(displayed);
  // Content that is "drawn on the board" (chalk cards, the abacus) sits
  // directly on the whiteboard surface — no white web-card panel behind it.
  const drawnOnBoard =
    displayed?.type === "title_card" || displayed?.type === "text_card" || displayed?.type === "abacus";

  return (
    <div
      className={`w-full overflow-hidden transition-[max-height,opacity,border-width] duration-300 ease-in-out ${
        drawnOnBoard ? "" : "rounded-3xl bg-white/85 shadow-lg backdrop-blur"
      } ${
        hasContent
          ? `max-h-[36rem] opacity-100 ${drawnOnBoard ? "" : "border border-orange-100"}`
          : "max-h-0 border-0 opacity-0"
      }`}
    >
      <div className={`p-5 transition-opacity duration-200 ${fadedIn ? "opacity-100" : "opacity-0"}`}>
        {displayed && hasVisibleBoardContent(displayed) && (
          <BoardContentView
            content={displayed}
            onManualInteraction={onManualInteraction}
            onSubmitTypedAnswer={onSubmitTypedAnswer}
          />
        )}
      </div>
    </div>
  );
}

function BoardContentView({
  content,
  onManualInteraction,
  onSubmitTypedAnswer,
}: {
  content: Exclude<BoardContent, { type: "empty" }>;
  onManualInteraction?: () => void;
  onSubmitTypedAnswer?: (value: string) => void;
}) {
  switch (content.type) {
    case "page_image":
      return (
        <PageImageView
          imageUrl={content.imageUrl}
          pageNumber={content.pageNumber}
          printedPageNumber={content.printedPageNumber}
          view={content.view}
          onManualInteraction={onManualInteraction}
        />
      );
    case "table":
      return (
        <TableView markdownTableText={content.markdownTableText} view={content.view} onManualInteraction={onManualInteraction} />
      );
    case "exercise":
      return <ExerciseView questionText={content.questionText} subparts={content.subparts} />;
    case "vocabulary_card":
      return <VocabularyCardView word={content.word} meaning={content.meaning} language={content.language} />;
    case "title_card":
      // Chalk-drawn on the board: a wobbly hand-drawn border, one big
      // Sinhala heading, one emoji — not a web card.
      return (
        <div className="relative flex min-h-[14rem] w-full max-w-xl flex-col items-center justify-center gap-4 p-10 text-center">
          <ChalkBorder />
          {content.emoji && <span className="text-6xl drop-shadow-sm">{content.emoji}</span>}
          <span className="chalk-text text-4xl font-bold text-[#3d4f5c]">{content.title}</span>
        </div>
      );
    case "text_card": {
      // The teacher's own board text, verbatim, chalk-style. When a
      // `highlight` is set, that fragment is ringed in chalk and the rest
      // stays put — the row of numbers she is working along does not have
      // to be torn down and redrawn to move attention one item to the right.
      const segments = content.highlight
        ? content.text.split(content.highlight).flatMap((part, index) =>
            index === 0 ? [part] : [{ mark: content.highlight as string }, part],
          )
        : [content.text];
      return (
        <div className="relative w-full max-w-2xl p-8">
          <ChalkBorder />
          <pre className="chalk-text overflow-x-auto whitespace-pre-wrap text-left text-lg leading-relaxed text-[#3d4f5c]">
            {segments.map((segment, index) =>
              typeof segment === "string" ? (
                <span key={index}>{segment}</span>
              ) : (
                <span
                  key={index}
                  className="rounded-full bg-[#3d4f5c]/12 px-2 py-0.5 font-bold text-[#1f2c35] ring-2 ring-[#3d4f5c]/45"
                >
                  {segment.mark}
                </span>
              ),
            )}
          </pre>
        </div>
      );
    }
    case "abacus":
      return (
        <AnimatedAbacus
          digits={content.digits}
          shown={content.shown}
          selfAnimate={content.selfAnimate}
          childAnswer={content.childAnswer}
        />
      );
    // One content bank item (see find-teaching-content/route.ts).
    case "lesson_content":
      return (
        <div className="flex flex-col gap-4">
          {content.components.map((component, index) => (
            <LessonComponentView
              key={index}
              component={component}
              filledAnswers={content.filledAnswers}
              activeBlank={content.activeBlank}
              onSubmitTypedAnswer={onSubmitTypedAnswer ?? (() => {})}
            />
          ))}
          {content.builtNumber && (
            // The read-back: the child's own number and its name, beneath
            // the picker they built it on. Rendered from real data — the
            // digits they chose and sinhalaNumberName — never a model.
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-orange-100/70 px-4 py-3 text-center">
              <span className="text-3xl font-bold tracking-widest text-orange-950">{content.builtNumber.digits}</span>
              <span className="font-sinhala text-xl text-orange-900">{content.builtNumber.name}</span>
            </div>
          )}
        </div>
      );
  }
}

/**
 * A hand-drawn-looking border, as if ruled onto the board with a marker:
 * an SVG rect whose corners and edges wobble slightly. Used by the chalk
 * cards so they read as drawn on the board, not laid over it.
 */
function ChalkBorder() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 240">
      <path
        d="M 14 12 Q 200 6 388 14 Q 394 120 386 228 Q 200 236 12 226 Q 6 118 14 12 Z"
        fill="none"
        stroke="#5b6d7a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 0"
        opacity="0.75"
        style={{ filter: "url(#chalk-rough)" }}
      />
      <defs>
        <filter id="chalk-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
        </filter>
      </defs>
    </svg>
  );
}

/** Simple, approximate overlay marking a highlighted region — see BoardHighlight. Never pixel-precise by design. */
function HighlightOverlay({ highlight }: { highlight: BoardHighlight }) {
  const { x, y } = highlight.focus ?? { x: 0.5, y: 0.5 };
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      <div className="h-20 w-20 animate-pulse rounded-xl border-4 border-rose-500/80 shadow-[0_0_0_4px_rgba(244,63,94,0.15)] sm:h-28 sm:w-28" />
      <span className="max-w-[12rem] rounded-full bg-rose-500 px-3 py-1 text-center text-xs font-semibold text-white shadow">
        {highlight.label}
      </span>
    </div>
  );
}

// Deliberately imperfect paths (viewBox 0 0 100 100) — a slightly
// asymmetric loop, a wavy line, an open-ended arrowhead, a skewed
// quadrilateral — so each mark reads as a teacher's pen stroke, not a
// crisp UI shape. See draw_marker / BoardMarker.
const MARKER_PATHS: Record<BoardMarker["shape"], string[]> = {
  circle: ["M 50 15 C 25 15, 12 30, 15 50 C 18 72, 32 88, 52 87 C 74 86, 90 68, 87 46 C 85 28, 68 13, 50 15 C 46 15, 44 17, 47 18"],
  underline: ["M 8 60 Q 30 55, 50 60 T 92 57"],
  arrow: ["M 88 12 C 72 28, 56 44, 42 58", "M 42 58 L 52 51", "M 42 58 L 47 68"],
  box: ["M 14 18 L 86 13 L 90 84 L 10 88 Z"],
};

/** A simple, approximate hand-drawn-style annotation — see BoardMarker. Never pixel-precise by design. */
function MarkerOverlay({ marker }: { marker: BoardMarker }) {
  const { x, y } = marker.focus ?? { x: 0.5, y: 0.5 };
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      <svg width="110" height="110" viewBox="0 0 100 100" className="overflow-visible drop-shadow-sm">
        <g stroke="#e11d48" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {MARKER_PATHS[marker.shape].map((d, index) => (
            <path key={index} d={d} />
          ))}
        </g>
      </svg>
      <span className="max-w-[12rem] rounded-full bg-rose-500 px-3 py-1 text-center text-xs font-semibold text-white shadow">
        {marker.label}
      </span>
    </div>
  );
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 300;

/**
 * Hand-rolled pinch-zoom + drag-pan + double-tap-to-toggle, via the Pointer
 * Events API (uniform across touch/mouse/pen, no gesture library needed).
 * Deliberately simple — no momentum or elastic bounce — this is a study
 * app's diagram viewer, not a photo app.
 */
function usePinchZoomPan(onManualChange?: () => void) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureStart = useRef<{ distance: number; transform: Transform } | null>(null);
  const lastTapAt = useRef(0);

  function clampScale(scale: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gestureStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), transform };
    } else if (pointers.current.size === 1) {
      gestureStart.current = { distance: 0, transform };
      const now = Date.now();
      if (now - lastTapAt.current < DOUBLE_TAP_MS) {
        onManualChange?.();
        setTransform((t) => (t.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2, x: 0, y: 0 }));
      }
      lastTapAt.current = now;
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const start = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && gestureStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = clampScale(
        gestureStart.current.transform.scale * (distance / (gestureStart.current.distance || distance)),
      );
      setTransform((t) => ({ ...t, scale }));
      onManualChange?.();
    } else if (pointers.current.size === 1 && gestureStart.current && gestureStart.current.transform.scale > 1) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      onManualChange?.();
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      gestureStart.current = pointers.current.size === 1 ? { distance: 0, transform } : null;
    }
  }

  return {
    transform,
    setTransform,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

function FullScreenImageViewer({
  imageUrl,
  alt,
  initialFocus,
  onClose,
  onManualInteraction,
}: {
  imageUrl: string;
  alt: string;
  initialFocus: { x: number; y: number } | null;
  onClose: () => void;
  onManualInteraction?: () => void;
}) {
  const { transform, setTransform, handlers } = usePinchZoomPan(onManualInteraction);

  // Start zoomed in on the AI's requested focus point the moment the
  // viewer opens (e.g. via zoom_to_region), rather than always opening at
  // a flat default view.
  useEffect(() => {
    if (!initialFocus) return;
    const container = document.getElementById("teaching-board-fullscreen-image-container");
    const size = container?.getBoundingClientRect();
    const dx = size ? (0.5 - initialFocus.x) * size.width : 0;
    const dy = size ? (0.5 - initialFocus.y) * size.height : 0;
    setTransform({ scale: 2, x: dx, y: dy });
    // Only on mount — this is the *opening* focus, not a continuous sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("a11y.close")}
        className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-2xl text-orange-900 shadow-lg active:scale-95"
      >
        ✕
      </button>
      <div
        id="teaching-board-fullscreen-image-container"
        className="flex flex-1 touch-none items-center justify-center overflow-hidden select-none"
        {...handlers}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic external Supabase Storage URL; not worth a next.config remotePatterns entry for one bucket */}
        <img
          src={imageUrl}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain transition-transform duration-75 ease-out"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
        />
      </div>
      <p className="pb-4 text-center text-sm text-white/70">Pinch or double-tap to zoom, drag to pan</p>
    </div>
  );
}

function PageImageView({
  imageUrl,
  pageNumber,
  printedPageNumber,
  view,
  onManualInteraction,
}: {
  imageUrl: string;
  pageNumber: number;
  printedPageNumber: number | null;
  view: {
    zoom: number;
    zoomFocus: { x: number; y: number } | null;
    highlight: BoardHighlight | null;
    marker: BoardMarker | null;
  };
  onManualInteraction?: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [expanded, setExpanded] = useState(false);
  // Tracks which AI-driven zoom "instruction" is currently in effect, so a
  // *new* zoom_to_region always opens the viewer again even if the child
  // had since closed it — but merely re-rendering with the same values
  // (e.g. an unrelated board-tool response arriving) doesn't reopen it.
  // State, not a ref, so it can be updated during render alongside the
  // other prop-derived state below (mutating a ref during render isn't
  // allowed under React's strict render-purity rules).
  const [lastAiZoom, setLastAiZoom] = useState<{ zoom: number; focus: { x: number; y: number } | null } | null>(null);

  // Reset to "loading" the instant a new image URL arrives — adjusted
  // during render (see the comment on TeachingBoard's own content-swap
  // state above) rather than in an effect, so a fast-arriving second image
  // doesn't briefly show the previous one's loaded/error state.
  const [trackedUrl, setTrackedUrl] = useState(imageUrl);
  if (imageUrl !== trackedUrl) {
    setTrackedUrl(imageUrl);
    setStatus("loading");
    setLastAiZoom(null);
    if (expanded) setExpanded(false);
  }

  // zoom_to_region should open the same full-screen viewer a manual tap
  // does (per its tool description) — detected here rather than in an
  // effect so it only fires on a genuinely new AI zoom instruction.
  if (view.zoom > 1 && (lastAiZoom?.zoom !== view.zoom || lastAiZoom?.focus !== view.zoomFocus)) {
    setLastAiZoom({ zoom: view.zoom, focus: view.zoomFocus });
    if (!expanded) setExpanded(true);
  }

  // Prefer the textbook's own printed page number (what the child actually
  // sees in the footer) — pageNumber (the raw PDF index) is only a fallback
  // for front-matter/unrecognized pages where it couldn't be parsed.
  const displayPageNumber = printedPageNumber ?? pageNumber;

  if (status === "error") {
    return (
      <div className="flex h-48 w-full max-w-sm flex-col items-center justify-center gap-2 rounded-xl border border-orange-100 bg-orange-50 px-4 text-center">
        <span className="text-3xl">🖼️</span>
        <p className="text-sm font-medium text-orange-600">Couldn&apos;t load this page — let&apos;s keep going!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Expand page ${displayPageNumber} to full screen`}
        className="relative flex min-h-[12rem] w-full items-center justify-center"
      >
        {status === "loading" && (
          <span
            className="absolute h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500"
            aria-label="Loading page image"
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic external Supabase Storage URL; not worth a next.config remotePatterns entry for one bucket */}
        <img
          src={imageUrl}
          alt={`Textbook page ${displayPageNumber}`}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`max-h-[28rem] w-auto max-w-full rounded-xl border border-orange-100 object-contain shadow-sm transition-opacity duration-200 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
        {status === "loaded" && view.highlight && <HighlightOverlay highlight={view.highlight} />}
        {status === "loaded" && view.marker && <MarkerOverlay marker={view.marker} />}
      </button>
      <p className="text-sm font-medium text-orange-600">Page {displayPageNumber} · tap to expand</p>
      {expanded && (
        <FullScreenImageViewer
          imageUrl={imageUrl}
          alt={`Textbook page ${displayPageNumber}`}
          initialFocus={view.zoom > 1 ? view.zoomFocus : null}
          onClose={() => setExpanded(false)}
          onManualInteraction={onManualInteraction}
        />
      )}
    </div>
  );
}

// Ignore onScroll events fired by our own imperative scrollTo (see the
// effect below) for this long — long enough for a smooth scroll to finish,
// short enough that a real drag/wheel scroll right afterward still counts
// as manual.
const PROGRAMMATIC_SCROLL_GUARD_MS = 500;

function TableView({
  markdownTableText,
  view,
  onManualInteraction,
}: {
  markdownTableText: string;
  view: { scrollTo: "start" | "end" | null; highlight: BoardHighlight | null };
  onManualInteraction?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticUntil = useRef(0);
  const lastScrollTo = useRef<"start" | "end" | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !view.scrollTo || view.scrollTo === lastScrollTo.current) return;
    lastScrollTo.current = view.scrollTo;
    programmaticUntil.current = Date.now() + PROGRAMMATIC_SCROLL_GUARD_MS;
    el.scrollTo({ left: view.scrollTo === "start" ? 0 : el.scrollWidth, behavior: "smooth" });
  }, [view.scrollTo]);

  function handleScroll() {
    if (Date.now() < programmaticUntil.current) return;
    onManualInteraction?.();
  }

  const table = parseMarkdownTable(markdownTableText);
  if (!table || table.headers.length === 0) {
    return <p className="whitespace-pre-wrap text-orange-950">{markdownTableText}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {view.highlight && (
        <p className="w-fit rounded-full bg-rose-500 px-3 py-1 text-sm font-semibold text-white shadow">
          🔍 {view.highlight.label}
        </p>
      )}
      {/* Contained horizontal scroll for a wide table — never shrink text to force-fit. */}
      <div ref={scrollRef} onScroll={handleScroll} className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse overflow-hidden rounded-xl text-left">
          <thead>
            <tr className="bg-orange-400 text-white">
              {table.headers.map((header, index) => (
                <th key={index} className="px-4 py-2 text-sm font-semibold whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-orange-50" : "bg-white"}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-2 whitespace-nowrap text-orange-950">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExerciseView({ questionText, subparts }: { questionText: string; subparts: string[] }) {
  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="text-lg leading-relaxed font-medium text-orange-950">{questionText}</p>
      {subparts.length > 0 && (
        <ol className="flex flex-col gap-2">
          {subparts.map((part, index) => (
            <li key={index} className="rounded-xl bg-orange-50 px-4 py-2 text-orange-950">
              {part}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function VocabularyCardView({ word, meaning, language }: { word: string; meaning: string; language: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold tracking-wide text-rose-600 uppercase">
        {language}
      </span>
      <p className="text-4xl font-bold text-orange-900">{word}</p>
      <p className="text-lg text-orange-800">{meaning}</p>
    </div>
  );
}
