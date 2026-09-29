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
  /**
   * MODE 2 alternation: the cell (or the rod) Zara takes herself. Said with the
   * pointer on the cell, before the fill, so a tutor turn never appears out of
   * nowhere. The first of an exercise uses showBoardMode1 above; the rest use this.
   */
  tutorTurn: "මේක මම කරන්නම්.",
  /** The daily limit ended the sitting: the close card and her closing line say so, never silence. */
  closeSessionDailyLimit: "අද කාලය ඉවරයි — හෙට ආයෙත් එන්න.",
  /** A touch surface with no tap for 12 s: one gentle nudge, then at 25 s she demonstrates and moves on. */
  touchNudge: "ඕනෑම එකක් තෝරලා බලන්න.",
  /** The first ✋: the only moment the microphone is asked for, explained in her words before the browser asks. */
  micPermission: "ඔයාගේ කටහඬ අහන්න මට අවසර ඕනේ. හරි කියලා දෙන්නකෝ.",

  // --- before a limit: two warnings, never a sudden stop (src/lib/timeWarnings.ts) ---
  /** ✋ chat, five minutes before it must close — said in the chat panel once she has finished speaking. The owner's words. */
  chatTimeSoon: "අපි තව පොඩ්ඩක් කතා කරමු, ඊට පස්සේ පාඩමට යමු නේද?",
  /** ✋ chat, one minute before it closes; at the limit it closes after her sentence and the lesson carries on. The owner's words. */
  chatTimeLast: "දැන් අන්තිම ප්‍රශ්නේ අහන්න, ඊට පස්සේ පාඩම දිගටම කරමු.",
  /** The daily lesson limit, five minutes before it — between beats. DRAFT (LESSON_TIME_DRAFTS below). */
  lessonTimeSoon: "අපි තව පොඩ්ඩක් වැඩ කරමු, ඊට පස්සේ අද පාඩම ඉවරයි.",
  /** The daily lesson limit, one minute before it — between beats; the sitting then ends after its exercise. DRAFT. */
  lessonTimeLast: "දැන් අන්තිම ටික කරලා, අද පාඩම ඉවර කරමු.",
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

/**
 * Lines written by the developer, not the owner, awaiting a native speaker's
 * sign-off before they are recorded: listed in docs/review/app-copy.md
 * (scripts/extract-copy.ts) with what each is meant to say.
 */
export const LESSON_TIME_DRAFTS: Array<{ key: keyof typeof AUTHORED_LINES; en: string }> = [
  { key: "lessonTimeSoon", en: "Let's work a little more, then today's lesson is over. (5 minutes before the daily lesson limit)" },
  { key: "lessonTimeLast", en: "Now let's do the last bit and finish today's lesson. (1 minute before the daily lesson limit)" },
];

/**
 * THE RETEACH LINE, ONE PER CONCEPT (20 Sep 2026).
 *
 * After a second miss the lesson re-teaches: the miss line announces it
 * (feedbackWrongBeforeReteach above), then a MODE 1 demonstration of a
 * DIFFERENT item is played. Between the two sat a beat with no words at
 * all — the one beat a model used to write at runtime — and once the
 * writer was switched off (18 Sep, cluster O; src/lib/paidCalls.ts) the
 * child heard nothing there. Silence is the one thing a re-teaching
 * moment cannot be.
 *
 * So each concept carries ONE short line, written here from that
 * concept's own objective in docs/design/maths-5-1.json: what they are
 * about to look at again, said as an invitation, before the
 * demonstration shows it. It is not a new explanation — the
 * demonstration is the explanation — only the sentence that carries the
 * child into it.
 *
 * The rules they are written under, asserted by authoredLines.test.ts:
 * at most fourteen words, the style card's spoken register
 * (docs/design/style-card.md), and NO word a later concept has yet to
 * introduce and nothing from vocabularyNotSpoken — a second miss is the
 * worst moment to meet a new term.
 *
 * No model wrote these and none may. A line the child hears is authored
 * here, reviewed by a native speaker, and recorded in her voice like
 * every other: the portal lists them as their own group, and
 * scripts/render-lesson-audio.ts puts them in the batch.
 */
export const RETEACH_LINES: Record<string, string> = {
  /** 9 999 තෙක් කුමන සංඛ්‍යාවක් වුව ද කියවයි. ඉලක්කමෙන් හා වචනයෙන් ලියයි. */
  readWrite4Digit: "සංඛ්‍යාව කියවලා, ඒකේ සංඛ්‍යා නාමය ලියන හැටි ආයෙ බලමු.",
  /** ඉලක්කම් හතරේ සංඛ්‍යාවල ස්ථානීය අගය දක්වයි. */
  placeValue4Digit: "ඉලක්කම තියෙන ස්ථානය බලමු — එතකොට ඒකේ ස්ථානීය අගය හොයාගන්න පුළුවන්.",
  /** ඉලක්කම් හතරේ සංඛ්‍යාවල ස්ථානීය අගය දක්වයි — සහ ඒවා විහිදුවා ලියයි. */
  expandedForm4Digit: "හැම ඉලක්කමේම අගය වෙන වෙනම ලියලා, ආයෙ එකතු කරලා බලමු.",
  /** 100 000 තෙක් සංඛ්‍යා කියයි. ලියයි. සංඛ්‍යා නාමය ලියයි. */
  beyond9999: "දස දහස ඉඳන් උඩට යන සංඛ්‍යා ආයෙ පොඩ්ඩක් එකට බලමු.",
  /** 100 000 තෙක් සංඛ්‍යා කියයි. ලියයි — ඉලක්කම් තුන් තුනට වෙන් කරලා. */
  digitGroupingRule: "එකස්ථානයේ ඉඳන් වම් පැත්තට තුනක් ගණන් කරලා, එතන පොඩි ඉඩක් තියමු.",
  /** 100 000 තෙක් සංඛ්‍යා කියයි. ලියයි. සංඛ්‍යා නාමය ලියයි. */
  tenThousandsPlace: "දස දහසස්ථානයේ ඉඳන් පටන් අරන්, කියවෙන්නේ නැති ස්ථානයට බින්දුව ලියමු.",
  /** දස දහසස්ථානය තෙක් සංඛ්‍යාවල එක් එක් ඉලක්කමෙන් නිරූපිත අගය දක්වයි. */
  placeValueTable5Digit: "වගුවේ හැම ස්ථානයකම ඉලක්කම බලලා, ඒ ස්ථානයේ කීයක් තියෙනවද කියලා බලමු.",
  /** 99 999ට නොවැඩි සංඛ්‍යා ස්ථානීය අගය අනුව විහිදුවා ලියයි. */
  expandedForm5Digit: "හැම ස්ථානයකම අගය වෙන වෙනම ලියමු — බින්දුව තියෙන ස්ථානයත් අත්හරින්නේ නෑ.",
};

/**
 * Does this sentence open one of Zara's own turns? A cell she fills in a
 * MODE 2 alternation must say so first (the device walk, 17 Sep): the long
 * frame opens the first turn of an exercise, the short one the rest. The
 * storyboard puts the pointer on the cell while she says it and the fill on
 * the sentence after; the dry run asserts no tutor fill goes unannounced.
 */
export function announcesTutorTurn(sentence: string): boolean {
  const squash = (text: string) => text.replace(/[\s,.!?]/gu, "");
  // The address ("පුතේ" / "දුවේ" / nothing) sits inside the frame, so each
  // frame is matched by the distinctive part AFTER it.
  const tail = (line: string) => squash(line.split("{address}").pop()!.split(". ")[0]!);
  const opener = squash(sentence);
  // mode 1 ("watch me do this") and mode 2 ("I'll start, you finish") are hers;
  // mode 3 ("now you do it alone") is the child's and opens nothing.
  return [AUTHORED_LINES.tutorTurn, AUTHORED_LINES.showBoardMode1, AUTHORED_LINES.showBoardMode2]
    .map(tail)
    .some((frame) => frame.length > 0 && opener.includes(frame));
}

/** Flat list for review printing: [label, line]. The reteach lines are in it — they are lines the child hears. */
export function listAuthoredLines(): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(AUTHORED_LINES) as Array<[string, string | readonly string[]]>) {
    if (Array.isArray(value)) value.forEach((line, i) => rows.push([`${key}[${i}]`, line]));
    else rows.push([key, value as string]);
  }
  for (const [tag, line] of Object.entries(RETEACH_LINES)) rows.push([`reteach:${tag}`, line]);
  return rows;
}
