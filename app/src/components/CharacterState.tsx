"use client";

/**
 * The character's 3 visual states, driven by real session state from
 * useGeminiLive.ts (not a visual demo): "idle" (session not connected),
 * "listening" (session live, child's turn — the AI isn't currently
 * speaking), "talking" (the AI's voice is actually audible right now, per
 * PcmPlayer's real playback state).
 */
export type CharacterVisualState = "idle" | "listening" | "talking";

// Exported so HostScreen.tsx's mobile "return to character" pill can reuse
// the same icon/color per state for its mini avatar, rather than
// duplicating the mapping.
export const CHARACTER_STATE_CONFIG: Record<
  CharacterVisualState,
  { bg: string; shadow: string; icon: string; label: string }
> = {
  idle: { bg: "bg-red-400 hover:bg-red-500", shadow: "shadow-red-200", icon: "🎙️", label: "ඉගෙන ගන්න සූදානම්" },
  listening: { bg: "bg-amber-400", shadow: "shadow-amber-200", icon: "👂", label: "අහගෙන ඉන්නවා..." },
  talking: { bg: "bg-emerald-500", shadow: "shadow-emerald-200", icon: "💬", label: "කතා කරනවා..." },
};

// Slightly varied heights read as a small audio-level meter; animate-pulse
// (opacity) plus a staggered delay per bar gives a lively, non-uniform
// pulse rather than everything blinking in lockstep.
const PULSE_BAR_HEIGHTS = [8, 16, 12, 18];

function PulseBars() {
  return (
    <span className="flex h-5 items-end gap-1" aria-hidden>
      {PULSE_BAR_HEIGHTS.map((height, index) => (
        <span
          key={index}
          className="w-1.5 animate-pulse rounded-full bg-white/85"
          style={{ height: `${height}px`, animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}

export default function CharacterState({ state, onClick }: { state: CharacterVisualState; onClick: () => void }) {
  const config = CHARACTER_STATE_CONFIG[state];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state !== "idle"}
      className={`flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-full text-white shadow-lg transition-colors active:scale-95 ${config.bg} ${config.shadow}`}
    >
      <span className="text-5xl">{config.icon}</span>
      {state !== "idle" && <PulseBars />}
      <span className="px-4 text-center text-sm font-semibold">{config.label}</span>
    </button>
  );
}
