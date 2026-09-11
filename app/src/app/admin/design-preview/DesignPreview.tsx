"use client";

import { useMemo, useState } from "react";
import storyboardJson from "@/data/storyboard/maths-5-1-session-1.json";
import type { Storyboard } from "@/lib/choreography";
import { DESIGN_FRAMES, designFrame, stageDesignFrame, stopsFor } from "@/lib/designFrames";
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
        ? { kind: "chat", child: "ටීචර්, එකස්ථානය කියන්නේ මොකක්ද?", zara: "එකස්ථානය කියන්නේ සංඛ්‍යාවේ දකුණු පැත්තේ අන්තිම ඉලක්කම තියෙන තැන පුතේ. 5 421 කියන සංඛ්‍යාවේ එකස්ථානයේ තියෙන්නේ 1.", listening: true, onReturn: noop }
        : null;
  return (
    <SessionShell
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
      handShown={!frame.sheet}
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
