"use client";

import { useGeminiLive } from "@/hooks/useGeminiLive";

const STATUS_COPY: Record<string, string> = {
  idle: "Tap the button and say hello!",
  connecting: "Getting ready...",
  listening: "I'm listening!",
  error: "Oops, something went wrong.",
};

export default function HostScreen({ childId = "demo-child" }: { childId?: string }) {
  const { status, error, outputTranscript, start, stop } = useGeminiLive({ childId });
  const isActive = status === "listening" || status === "connecting";

  return (
    <div className="flex flex-1 flex-col items-center justify-between gap-8 bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50 px-6 py-12 text-center">
      <header className="flex flex-col items-center gap-2">
        <span className="text-4xl">📚✨</span>
        <h1 className="text-2xl font-bold text-orange-900">Serendib Scholar</h1>
        <p className="text-base text-orange-700">Your friendly study buddy</p>
      </header>

      <main className="flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8">
        <button
          type="button"
          onClick={isActive ? stop : start}
          aria-pressed={isActive}
          className={`flex h-48 w-48 items-center justify-center rounded-full text-6xl shadow-lg transition-transform active:scale-95 ${
            isActive
              ? "animate-pulse bg-rose-400 shadow-rose-200"
              : "bg-orange-400 shadow-orange-200 hover:bg-orange-500"
          }`}
        >
          {isActive ? "🎙️" : "👋"}
        </button>

        <p className="min-h-8 text-lg font-medium text-orange-900">
          {error ?? STATUS_COPY[status]}
        </p>

        {outputTranscript && (
          <p className="rounded-2xl bg-white/70 px-5 py-4 text-lg leading-relaxed text-orange-950 shadow-sm">
            {outputTranscript}
          </p>
        )}
      </main>

      <footer>
        <p className="text-sm text-orange-600">
          Ask me anything about your Grade 5 Scholarship studies!
        </p>
      </footer>
    </div>
  );
}
