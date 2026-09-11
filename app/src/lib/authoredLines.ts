/**
 * EVERY fixed Sinhala line the tutor can speak that was authored by the
 * developer rather than taken from the teacher's transcript, in one place —
 * with the {address} token wherever the child is addressed directly
 * (resolved per child: පුතේ / දුවේ / dropped — see src/lib/addressToken.ts) —
 * so a native speaker can review (and edit) the wording without hunting
 * through the builder and orchestrator. The dry run prints this whole
 * table (see scripts/dry-run-lesson.ts).
 *
 * Everything else the tutor says verbatim comes from the cleaned transcript
 * (explanation rows' spokenTranscript), the teacher's own stepsShown, or
 * the hand-edited blueprint file.
 */

export const AUTHORED_LINES = {
  // --- item framing (lessonScriptBuilder.ts) -----------------------------
  showBoardMode1: "දැන් බලන්න {address}, මම මේක කරලා පෙන්නන්නම්. ඔයා බලාගෙන ඉන්න.",
  showBoardMode2: "මේක අපි දෙන්නම එකට කරමු. මම පටන් ගන්නම්, ඔයා ඉවර කරන්න.",
  showBoardMode3: "හරි, දැන් මේක {address} තනියම කරලා බලන්න.",
  checkpoint: "හරි නේද {address}? තේරුණාද?",
  transition: "හොඳයි! ඒ ටික අපි හොඳට කළා. දැන් ඊළඟ දේ බලමු.",
  /** {value} is replaced with the cell's value. */
  revealBlank: "බලන්න, මෙතනට එන්නේ {value}. මම ලියන්නම්.",

  // --- runtime-inserted beats (lessonOrchestrator.ts) --------------------
  wait: "හිතාගන්න වෙලාව ගන්න {address}. උදව්වක් ඕනනම් කියන්න.",
  /** ASK ladder stage 2 (spec wording). */
  offerHelp: "උදව්වක් ඕනද? මම පොඩි ඉඟියක් දෙන්නද?",
  /** ASK ladder stage 3 — she shows the answer and moves on. {value} = the answer. */
  giveUpReveal: "කමක් නෑ {address}, බලන්න — උත්තරේ {value}. පස්සේ ආයෙ මේක එකට කරමු.",
  /** SOFT_CHECK acknowledgement when the child chimes in — then her own words continue. */
  softAck: "හරි!",
  /** Said once when a concept's beats are finished — before the strip lights its stop. */
  conceptDone: "නියමයි {address}! මේ කොටස අපි ඉවර කළා.",
  feedbackCorrect: ["හරි! ඔයා හරියටම කිව්වා! නියමයි!", "ඔව්, හරි උත්තරේ! හොඳයි {address}!"],
  feedbackWrongBeforeReteach: [
    "කමක් නෑ, ඒක ටිකක් අමාරුයි. අපි ආයේ එකට බලමු.",
    "අනේ ඒක නෙමෙයි, ඒත් කමක් නෑ. මම ආයෙ පොඩ්ඩක් පෙන්නන්නම්.",
  ],
  feedbackWrong: ["හ්ම්, ඒක නෙමෙයි. ආයෙ පොඩ්ඩක් හිතලා බලන්න.", "ළඟයි! තව එක පාරක් හිතලා බලමුද?"],

  // --- session framing ----------------------------------------------------
  /** Session start is ONE line, then straight into content — no chat interview. */
  sessionStartFirst: "ආයුබෝවන් {address}! අද අපි පටන් ගමු.",
  sessionStartReturning: "හරි {address}, අපි ඊයේ තැනින් පටන් ගමු.",
  /** The mid-session break: an OFFER of a chat, answered yes/no by the child. */
  breakChatOffer: "පොඩි කතාවක් කරමුද?",
  /** The end of a sitting. Fixed words, so it renders once into the clip cache. */
  closeSession: "අද අපි හොඳට වැඩ කළා {address}. ඊළඟ පාරටත් මම බලාගෙන ඉන්නම්. ගිහින් එන්නම්!",
  /** The RECAP intro, before the single review question. */
  recapIntro: "අපි ඊයේ කරපු දේ ටිකක් බලමු {address}.",
  /** The review question itself — the board shows the item being asked about. */
  recapAsk: "මේකේ උත්තරේ මොකක්ද කියන්න බලන්න.",
  /** CONFIRM: a doubtful hearing, read back to the child. {value} = what was heard. (Voice assessment only.) */
  confirmHeard: "ඔයා කිව්වේ {value} නේද?",

  // --- the touch-only answer path ------------------------------------------
  /** Reading practice: after the child's 3 s to say it, Zara reads the number herself — this frame, then the composed number. */
  readBack: "මම කියන්නම් —",
  /** A touch surface with no tap for 12 s: one gentle nudge, then at 25 s she demonstrates and moves on. */
  touchNudge: "ඕනෑම එකක් තෝරලා බලන්න.",
  /** The first ✋: the only moment the microphone is asked for, explained in her words before the browser asks. */
  micPermission: "ඔයාගේ කටහඬ අහන්න මට අවසර ඕනේ. හරි කියලා දෙන්නකෝ.",
  /**
   * The practice questions. The BOARD says which cell is being asked about
   * (the active blank is highlighted), so the words stay the same every
   * time — which is what lets every question be a cached clip instead of a
   * sentence a model has to compose mid-lesson.
   */
  askBlank: "දැන් ඔයාගේ වාරයයි {address}. මේ හිස්තැනට එන්නේ මොකක්ද කියන්න බලන්න.",
  askSolution: "දැන් ඔයා කරලා බලන්න {address}. උත්තරේ මොකක්ද?",

  // --- hook (default praise; the blueprint file can override per concept) --
  hookPraiseDefault: "හරි! දහසේ එකක්, සීයේ එකක්, දහයේ එකක්, එකේ එකක් — ඒක තමයි අද අපි ඉගෙන ගන්න යන්නේ.",
} as const;

/** Flat list for review printing: [label, line]. */
export function listAuthoredLines(): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(AUTHORED_LINES) as Array<[string, string | readonly string[]]>) {
    if (Array.isArray(value)) value.forEach((line, i) => rows.push([`${key}[${i}]`, line]));
    else rows.push([key, value as string]);
  }
  return rows;
}
