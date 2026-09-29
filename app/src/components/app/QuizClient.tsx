"use client";

import { useEffect, useState } from "react";
import { QuizScreen } from "./screens/Quiz";
import { AccessCodeGate } from "./AccessCodeGate";
import { PrimaryButton, SecondaryButton } from "./Screen";
import { sx } from "./sx";
import { t } from "@/lib/appCopy";
import { ensureSession, postJson } from "@/lib/clientSession";
import type { QuizQuestion } from "@/lib/appTypes";

interface RecapBeat {
  id: string;
  itemId: string | null;
  conceptTag: string;
  spokenText?: string;
  expectedAnswer?: string;
  choices?: { options: string[]; correctIndex: number };
  quiz?: { number: string | null; digit: string | null; field: string | null; expansion: string | null };
}

/**
 * The practice quiz: up to five MCQ questions for one concept from
 * /api/recap (the same verified bank + distractor engine the lesson's
 * RECAP uses), judged on the spot against the item's own answer, each
 * answer logged to child_progress like a lesson answer. Five dots, no timer.
 */
export function QuizClient({ concept }: { concept: string }) {
  const [gate, setGate] = useState<{ wrong: boolean } | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<Array<boolean | null>>([null, null, null, null, null]);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const r = await postJson<{ ok: boolean; beats: RecapBeat[] }>("/api/recap", { concept_tags: [concept] });
    if (!r.ok || !r.json?.ok) {
      setError(t("session.connectFail"));
      return;
    }
    const qs = r.json.beats.filter((b) => b.choices && b.choices.options.length > 0).slice(0, 5).map(toQuestion);
    setQuestions(qs);
    setResults(Array.from({ length: Math.max(1, qs.length) }, () => null));
  };

  useEffect(() => {
    void ensureSession().then((r) => {
      if (r.status === "ok") void load();
      else if (r.status === "locked") setGate({ wrong: r.wrong });
      else setError(t("session.connectFail"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept]);

  const question = questions?.[index] ?? null;
  const finished = questions !== null && index >= questions.length;
  const check = async () => {
    if (!question || selected === null) return;
    const correct = selected === question.correctIndex;
    setFlash(correct ? "correct" : "wrong");
    setResults((r) => r.map((v, i) => (i === index ? correct : v)));
    void postJson("/api/tools/log-answer", { question_id: question.itemId, correct, topic: question.conceptTag });
    setTimeout(() => {
      setFlash(null);
      setSelected(null);
      setIndex((i) => i + 1);
    }, 900);
  };

  if (gate) return <AccessCodeGate wrong={gate.wrong} onUnlocked={() => { setGate(null); void load(); }} />;
  if (finished) {
    const asked = results.filter((r) => r !== null).length;
    const right = results.filter((r) => r === true).length;
    return (
      <div className="app-screen" data-app-screen="Quiz done" style={sx("min-height:100dvh;background:var(--color-board);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center")}>
        <div style={sx("font:700 28px/1.5 var(--font-display);color:var(--color-ink)")} data-testid="quiz-done">{t("quiz.done", { asked, correct: right })}</div>
        <div style={sx("font-size:34px;line-height:1;color:var(--color-saffron);letter-spacing:-2px")}>
          {"★".repeat(Math.min(3, Math.round((3 * right) / Math.max(1, asked))))}
          <span style={sx("color:rgba(27,27,27,.18)")}>{"★".repeat(3 - Math.min(3, Math.round((3 * right) / Math.max(1, asked))))}</span>
        </div>
        <PrimaryButton href="/practice" height={56} style={{ width: 240 }}>
          {t("practice.title")}
        </PrimaryButton>
        <SecondaryButton href="/home" height={48} style={{ width: 240 }}>
          {t("edge.error.home")}
        </SecondaryButton>
      </div>
    );
  }
  return (
    <>
      <QuizScreen question={questions === null ? null : question} index={index} results={results} selected={selected} onSelect={flash ? undefined : setSelected} onCheck={() => void check()} checking={Boolean(flash)} zara={flash === "correct" ? "celebrate" : flash === "wrong" ? "encourage" : "listening"} lena={flash === "correct" ? "hop" : flash === "wrong" ? "droop-then-nudge" : "alert"} />
      {error && <div style={sx("position:fixed;left:0;right:0;bottom:100px;text-align:center;font:600 20px/1.5 var(--font-label);color:var(--color-coral-text)")}>{error}</div>}
    </>
  );
}

const COLUMN_LABEL: Record<string, string> = { digit: t("quiz.colDigit"), place: t("quiz.colPlace"), placeValue: t("quiz.colPlaceValue"), valueRepresented: t("quiz.colValue"), numberName: t("quiz.colName") };

function group(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}

/** A recap ASK → what the quiz draws: the item's number as stroke numerals and the column asked, or the expansion line with a ▢. */
function toQuestion(beat: RecapBeat): QuizQuestion {
  const q = beat.quiz;
  const expansion = q?.expansion ? q.expansion.replace(/(\d)(?=(\d{3})+(?!\d))/gu, "$1 ") : null;
  return {
    prompt: expansion ? t("quiz.expansionAsk") : (beat.spokenText ?? t("quiz.recapAsk")),
    figure: expansion ?? (q?.number ? group(q.number) : ""),
    asking: q?.field ? `${q.digit !== null && q.digit !== undefined ? `${t("quiz.colDigit")} ${q.digit} · ` : ""}${COLUMN_LABEL[q.field] ?? ""}` : "",
    options: beat.choices?.options ?? [],
    correctIndex: beat.choices?.correctIndex ?? 0,
    conceptTag: beat.conceptTag,
    itemId: beat.itemId ?? beat.id,
  };
}
