import Link from "next/link";
import ZaraCharacter from "@/components/ZaraCharacter";
import { BackButton, BottomNav, Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { LessonMapData, MapNode } from "@/lib/appTypes";

/** Screens A's `node()` — the per-kind looks, verbatim. */
function nodeStyle(n: MapNode) {
  const done = n.kind === "done";
  const cur = n.kind === "current";
  return {
    size: cur ? "76px" : "60px",
    bg: done ? "#0F4C5C" : cur ? "#E9B44C" : "transparent",
    border: n.kind === "locked" ? "3px dashed rgba(27,27,27,.4)" : "0",
    fg: done ? "#fff" : cur ? "#1B1B1B" : "rgba(27,27,27,.4)",
    fg2: n.kind === "locked" ? "rgba(27,27,27,.5)" : "#1B1B1B",
    sh: cur ? "0 0 0 4px #E9B44C, 0 0 24px 6px rgba(233,180,76,.55)" : "none",
    stars: "★".repeat(n.stars),
    grey: n.kind === "locked" ? "" : "★".repeat(3 - n.stars),
  };
}

/** Screens A · Lesson map — a chalk path, not a list. */
export function LessonMapScreen({ data, frame }: { data: LessonMapData; frame?: boolean }) {
  const doneCount = data.nodes.filter((n) => n.kind === "done").length;
  // The teal (walked) part of the path reaches the current node: one segment per done node.
  const segments = ["M100 40C220 40 320 60 300 130", "C280 200 120 170 100 240", "C80 320 300 300 290 390", "C280 470 60 450 90 520", "C120 590 300 560 300 600"];
  const walked = doneCount > 0 ? segments.slice(0, Math.min(segments.length, doneCount)).join("") : "";
  return (
    <Screen label="Lesson map" frame={frame} root="background:var(--color-board);background-image:linear-gradient(var(--color-grid) 1px,transparent 1px),linear-gradient(90deg,var(--color-grid) 1px,transparent 1px);background-size:32px 32px">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px")}>
        <BackButton href="/home" />
        <div style={sx("display:grid")}>
          <span style={sx("font:700 28px/1.5 var(--font-display);color:var(--color-ink)")}>{t("brand.maths")}</span>
          <span style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{t("map.subtitle", { lessons: data.lessonsCount, stars: data.stars, total: data.starsTotal })}</span>
        </div>
      </div>
      <svg viewBox="0 0 390 620" width="390" height="620" style={sx("position:absolute;left:0;top:120px;overflow:visible")} data-testid="chalk-path">
        <path d="M100 40C220 40 320 60 300 130C280 200 120 170 100 240C80 320 300 300 290 390C280 470 60 450 90 520C120 590 300 560 300 600" fill="none" stroke="rgba(27,27,27,.28)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 12" />
        {walked && <path d={walked} fill="none" stroke="#0F4C5C" strokeWidth="5" strokeLinecap="round" />}
      </svg>
      {data.nodes.map((n) => {
        const s = nodeStyle(n);
        const inner = (
          <>
            <div style={sx(`width:${s.size};height:${s.size};border-radius:50%;background:${s.bg};border:${s.border};display:flex;align-items:center;justify-content:center;font:700 26px/1 var(--font-display);color:${s.fg};box-shadow:${s.sh}`)} data-glow={n.kind === "current" ? "true" : undefined}>
              {n.num}
            </div>
            <div style={sx("font-size:16px;line-height:1;color:var(--color-saffron);letter-spacing:-1px;height:16px")}>
              {s.stars}
              <span style={sx("color:rgba(27,27,27,.18)")}>{s.grey}</span>
            </div>
            <div style={sx(`font:700 20px/1.4 var(--font-display);color:${s.fg2};text-align:center;text-wrap:balance`)}>{n.name}</div>
          </>
        );
        const style = sx(`position:absolute;left:${n.x}px;top:${n.y}px;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:6px;width:150px`);
        return n.lessonNumber !== null && n.kind !== "locked" ? (
          <Link key={n.num} href={`/lessons/${n.lessonNumber}`} style={style} data-testid={`node-${n.num}`} data-kind={n.kind}>
            {inner}
          </Link>
        ) : (
          <div key={n.num} style={style} data-testid={`node-${n.num}`} data-kind={n.kind}>
            {inner}
          </div>
        );
      })}
      {data.zaraAt && (
        <div style={sx(`position:absolute;left:${data.zaraAt.x}px;top:${data.zaraAt.y}px`)}>
          <ZaraCharacter state="pointing-left" amplitude={0} portrait size={64} />
        </div>
      )}
      <BottomNav active={1} absolute />
    </Screen>
  );
}
