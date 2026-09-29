import Link from "next/link";
import { HandNumber } from "@/components/board/HandNumber";
import ZaraCharacter from "@/components/ZaraCharacter";
import LenaCharacter from "@/components/LenaCharacter";
import { Screen } from "../Screen";
import { sx } from "../sx";
import { t } from "@/lib/appCopy";
import type { QuizQuestion } from "@/lib/appTypes";

/**
 * Screens C · Quiz — one question, board primitives, 5 dots, no timer.
 * Presentational: the quiz page owns the state (which question, what was
 * tapped, what came of it) and hands it here.
 */
export function QuizScreen({ question, index, results, selected, onSelect, onCheck, frame, checking, closeHref = "/practice", zara = "listening", lena = "alert" }: { question: QuizQuestion | null; index: number; results: Array<boolean | null>; selected: number | null; onSelect?: (i: number) => void; onCheck?: () => void; frame?: boolean; checking?: boolean; closeHref?: string; zara?: "listening" | "celebrate" | "encourage"; lena?: "alert" | "hop" | "droop-then-nudge" }) {
  const dots = results.map((r, i) => (r === true ? { bg: "#3C8C5A", b: "#3C8C5A" } : r === false ? { bg: "#E9B44C", b: "#E9B44C" } : i === index ? { bg: "#E9B44C", b: "#E9B44C" } : { bg: "transparent", b: "rgba(27,27,27,.3)" }));
  const figureIsNumber = question ? /^[\d\s+=▢.,:/-]+$/u.test(question.figure) && /\d/u.test(question.figure) && !/[▢=]/u.test(question.figure) : false;
  return (
    <Screen label="Quiz" frame={frame} root="background:var(--color-board);background-image:linear-gradient(var(--color-grid) 1px,transparent 1px),linear-gradient(90deg,var(--color-grid) 1px,transparent 1px);background-size:32px 32px;display:flex;flex-direction:column">
      <div style={sx("padding:52px 20px 0;display:flex;align-items:center;gap:12px")}>
        <Link href={closeHref} aria-label={t("a11y.close")} style={sx("width:56px;height:56px;border-radius:50%;background:var(--color-paper);border:2px solid var(--color-ink-18);display:flex;align-items:center;justify-content:center;font:22px/1 var(--font-latin)")}>
          ✕
        </Link>
        <div style={sx("flex:1;display:flex;gap:8px;justify-content:center")} data-testid="quiz-dots">
          {dots.map((d, i) => (
            <span key={i} style={sx(`width:14px;height:14px;border-radius:50%;background:${d.bg};border:2px solid ${d.b};box-sizing:border-box`)} />
          ))}
        </div>
        <span style={sx("width:48px")} />
      </div>
      <div style={sx("padding:20px 20px 0;display:grid;gap:16px;justify-items:center")}>
        <div style={sx("font:700 26px/1.6 var(--font-display);color:var(--color-ink);text-align:center;text-wrap:balance")} data-testid="quiz-prompt">
          {question ? question.prompt : t("common.notYet")}
        </div>
        {question && (
          <div style={sx("display:flex;justify-content:center;padding:8px 0")} data-testid="quiz-figure">
            {figureIsNumber ? <HandNumber text={question.figure} size={56} color="#1B1B1B" draw={false} registerNumbers={false} /> : <span style={sx("font:700 36px/1.4 var(--font-display);color:var(--color-ink)")}>{question.figure}</span>}
          </div>
        )}
        {question?.asking && <div style={sx("font:600 20px/1.5 var(--font-label);color:var(--color-ink-70)")}>{question.asking}</div>}
        <div style={sx("display:grid;gap:10px;width:100%")} data-testid="quiz-chips">
          {(question?.options ?? []).map((o, i) => {
            const sel = i === selected;
            return (
              <button key={i} type="button" onClick={onSelect ? () => onSelect(i) : undefined} data-selected={sel || undefined} style={sx(`height:56px;border:2px solid ${sel ? "#E9B44C" : "rgba(27,27,27,.18)"};border-radius:999px;background:${sel ? "#FBEFD3" : "#FFFDF8"};display:flex;align-items:center;justify-content:center;font:700 24px/1.5 var(--font-display);color:var(--color-ink);box-shadow:0 2px 0 #D8D1C2`, { boxSizing: "content-box", width: "auto", padding: 0 })}>
                {o}
              </button>
            );
          })}
        </div>
      </div>
      <div style={sx("margin-top:auto;padding:0 20px 28px;display:flex;align-items:flex-end;justify-content:space-between")}>
        <ZaraCharacter state={zara} amplitude={0} portrait size={64} />
        <button type="button" onClick={onCheck} disabled={selected === null || checking || !question} data-testid="quiz-check" style={sx("height:56px;padding:0 32px;border:0;border-radius:12px;background:var(--color-teal);color:#fff;font:700 24px/1.5 var(--font-display);box-shadow:var(--shadow-button)", { opacity: selected === null || !question ? 0.45 : 1 })}>
          {t("quiz.check")}
        </button>
        <LenaCharacter state={lena} size={48} />
      </div>
    </Screen>
  );
}
