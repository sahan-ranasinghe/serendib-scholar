"use client";

import { t } from "@/lib/appCopy";
import { useEffect, useMemo, useState } from "react";
import storyboardJson from "@/data/storyboard/maths-5-1-session-1.json";
import type { Storyboard } from "@/lib/choreography";
import { DESIGN_FRAMES, designFrame, momentsFor, stageDesignFrame, stageStoryboardBeat, stopsFor, type BeatMoment } from "@/lib/designFrames";
import { SessionShell, type SessionSheet } from "@/components/SessionShell";

const storyboard = storyboardJson as unknown as Storyboard;
const noop = () => {};

export function DesignPreview({ frameId }: { frameId: string }) {
  const frame = designFrame(frameId);
  const [captionsOn] = useState(true);
  const staged = useMemo(() => (frame ? stageDesignFrame(storyboard, frame) : null), [frame]);
  if (!frame || !staged) {
    return (
      <div style={{ padding: 24, font: "14px/1.5 var(--font-latin)" }}>
        <p>Unknown frame “{frameId}”. Frames:</p>
        <ul>
          {DESIGN_FRAMES.map((f) => (
            <li key={f.id}>
              <a href={`?frame=${encodeURIComponent(f.id)}`}>{f.id}</a> — {f.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const sheet: SessionSheet | null =
    frame.sheet === "mic"
      ? { kind: "mic", onAllow: noop, onType: noop }
      : frame.sheet === "chat"
        ? { kind: "chat", childSpoke: true, zara: "එකස්ථානය කියන්නේ සංඛ්‍යාවේ දකුණු පැත්තේ අන්තිම ඉලක්කම තියෙන තැන පුතේ. 5 421 කියන සංඛ්‍යාවේ එකස්ථානයේ තියෙන්නේ 1.", listening: true, onReturn: noop }
        : null;
  return (
    <SessionShell
      title={`${t("brand.maths")} · ${t("lesson.1")}`}
      stage={staged.stage}
      yourTurn={staged.yourTurn}
      zaraState={frame.zara}
      lenaState={frame.lena}
      pointerSide={frame.zara === "pointing" ? "right" : null}
      talking={Boolean(frame.talking)}
      // A quiet talking amplitude: the export's talking frames show the middle mouth (talk2).
      getAmplitude={() => 0.1}
      conceptStops={stopsFor(frame.stop)}
      captionsOn={captionsOn}
      onToggleCaptions={noop}
      caption={frame.caption ?? null}
      hint={null}
      sheet={sheet}
      charactersShown
      handShown={frame.sheet !== "mic"}
      chatting={frame.sheet === "chat"}
      onHand={noop}
      onPause={noop}
      onRepeat={noop}
      onEnd={noop}
      onAnswer={noop}
      onTouch={noop}
      data={{ "data-design-frame": frame.id, "data-status": frame.sheet === "chat" ? "chatting" : staged.yourTurn ? (staged.yourTurn.kind === "soft" ? "pausing" : "turn") : "teaching" }}
    />
  );
}


/**
 * /admin/design-preview?beat=<storyboard beat id>[&moment=end|turn|answered] — ANY beat of the lesson, staged the way the
 * runtime reaches it (the storyboard replayed through the reducer). scripts/board-check.ts walks every beat here and asks
 * the board's own layout probe whether anything overlaps; it restages in place through `window.__stageBeat(id, moment)`
 * and reads the list from `window.__storyboardBeats`.
 */
export function BeatPreview({ beatId, moment }: { beatId: string; moment: BeatMoment }) {
  const [at, setAt] = useState<{ beatId: string; moment: BeatMoment }>({ beatId, moment });
  useEffect(() => {
    const w = window as unknown as { __stageBeat?: (id: string, m?: BeatMoment) => void; __storyboardBeats?: Array<{ id: string; moments: BeatMoment[] }> };
    w.__stageBeat = (id, m = "end") => setAt({ beatId: id, moment: m });
    w.__storyboardBeats = storyboard.beats.map((b) => ({ id: b.id, moments: momentsFor(b) }));
  }, []);
  const staged = useMemo(() => {
    try {
      return stageStoryboardBeat(storyboard, at.beatId, at.moment);
    } catch {
      return null;
    }
  }, [at]);
  if (!staged) return <div style={{ padding: 24, font: "14px/1.5 var(--font-latin)" }}>Unknown beat “{at.beatId}”.</div>;
  return (
    <SessionShell
      title={`${t("brand.maths")} · ${t("lesson.1")}`}
      stage={staged.stage}
      yourTurn={staged.yourTurn}
      zaraState="talking"
      lenaState="idle"
      pointerSide={null}
      talking={false}
      getAmplitude={() => 0}
      conceptStops={stopsFor(0)}
      captionsOn
      onToggleCaptions={noop}
      caption={staged.caption}
      hint={null}
      sheet={null}
      charactersShown
      handShown
      onHand={noop}
      onPause={noop}
      onRepeat={noop}
      onEnd={noop}
      onAnswer={noop}
      onTouch={noop}
      data={{ "data-staged-beat": at.beatId, "data-staged-moment": at.moment, "data-status": staged.yourTurn ? "turn" : "teaching" }}
    />
  );
}
