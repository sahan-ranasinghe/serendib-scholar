/**
 * Function declarations exposed to the Gemini Live model. These are sent as
 * part of the (server-locked) session setup and describe the only actions
 * the model can take beyond speaking — searching the syllabus, recording
 * progress/safety signals for the child's session, and controlling "the
 * board" (src/components/TeachingBoard.tsx), a visual area alongside the
 * voice UI. Every board tool renders deterministically from real data the
 * model already has (transcribed text/tables, or a real stored page image)
 * — never anything AI-generated.
 *
 * What is NOT here is as important as what is. Choosing lesson content,
 * staging it, filling blanks in and judging answers all used to be tools on
 * this list; they are now driven by the lesson orchestrator (see
 * src/lib/lessonOrchestrator.ts), which stages the board itself and then
 * tells the model what to say about it. What remains is emphasis the model
 * may reach for mid-sentence — pointing, zooming, marking — plus the
 * syllabus search and the progress/safety signals.
 *
 * Kept as plain JSON Schema via `parametersJsonSchema` so the same object can
 * be embedded directly in the ephemeral token's `liveConnectConstraints` on
 * the server, and in the raw WebSocket `setup` message shape on the client.
 */

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * The ✋ chat's own tools — read-only: they move the pointer or draw a
 * chalk ring on the lesson's board and change nothing. `target` is a
 * board target key: rod:0-3 (abacus rods, 0 = දහසස්ථානය, 1 = සියයස්ථානය,
 * 2 = දහයස්ථානය, 3 = එකස්ථානය), number:<n> (a number on the board),
 * card:<n>, part:<i> (an expansion slot), cell:<row>/<field>,
 * text:<exact text on the board>.
 */
export const CHAT_BOARD_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "point_at",
    description:
      "Move Zara's pointer to something on the lesson board while you talk about it — read-only. target examples: rod:1 (the hundreds rod of the abacus), number:5421, card:101, part:2, text:ස්ථානීය අගය.",
    parametersJsonSchema: {
      type: "object",
      properties: { target: { type: "string", description: "A board target key, e.g. rod:0, number:5421, card:84, part:1, text:…" } },
      required: ["target"],
    },
  },
  {
    name: "highlight_board",
    description: "Draw a chalk ring (or an underline) around something on the lesson board — read-only, nothing changes.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "A board target key, as for point_at." },
        kind: { type: "string", enum: ["circle", "underline"], description: "circle (default) or underline." },
      },
      required: ["target"],
    },
  },
];

export const GEMINI_LIVE_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "search_syllabus",
    description:
      "Searches the official Grade 5 Scholarship Exam syllabus database for a given subject and topic using semantic search, and returns the most relevant excerpts. If the top result covers a single page and has a real page image, it is automatically shown on the board as part of this call — you don't need a separate action to display it. If the top result's content spans more than one page (its `pages` list has more than one number), no image is auto-shown, because there's no way to know in advance which of those pages you'll actually be narrating from — the content is labeled with \"[Page N]\" markers per part, so call show_page_image yourself with the exact page number matching whatever you're currently discussing. Only call this for a subject listed in your current subject coverage (see your system instructions) — never for a subject outside that list, and never answer an in-coverage academic question from memory alone without calling this first.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description:
            "The subject to search — must be one of the subjects in your current subject coverage (see your system instructions for the exact list). Do not guess or invent a subject that isn't listed there.",
        },
        topic: {
          type: "string",
          description:
            'The specific topic or question area within the subject, e.g. "fractions", "the water cycle".',
        },
      },
      required: ["subject", "topic"],
    },
  },
  {
    name: "log_answer",
    description:
      "Records whether the child answered a practice question correctly, for progress tracking. Call this once right after the child gives their final answer to a question.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        question_id: {
          type: "string",
          description: "An identifier for the question that was answered.",
        },
        correct: {
          type: "boolean",
          description: "Whether the child's answer was correct.",
        },
        topic: {
          type: "string",
          description: "The topic the question belongs to.",
        },
      },
      required: ["question_id", "correct", "topic"],
    },
  },
  {
    name: "flag_weakness",
    description:
      "Flags a topic the child appears to be consistently struggling with, so a parent or teacher can follow up with extra help.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic the child is struggling with.",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "request_teacher_review",
    description:
      "Flags the current conversation for a human adult to review — for example if the child seems distressed, mentions being hurt, or raises something outside what this assistant should handle alone. This does not interrupt the conversation; it just notifies an adult afterward.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "A brief, factual description of why this conversation needs review.",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "show_page_image",
    description:
      "Displays the real scanned textbook page image on the board — for a diagram/illustration, or a blank fill-in worksheet the child should see while you walk through it verbally (its blanks aren't in the transcribed text, so you can't read them aloud). search_syllabus auto-displays the top result's image only when that result covers a single page; for a multi-page result, always call this yourself with the page number matching whatever specific content you're currently narrating (check the \"[Page N]\" markers in that result's content — never default to the first page or guess). Also use this to show a different page within a result's `pages` list, or to re-show an image after the board was cleared or replaced. Use the exact source_reference and one of the page numbers from a search_syllabus result's `pages` list — never invent either.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        source_reference: {
          type: "string",
          description: "The exact source_reference string from the search_syllabus result whose page you want to show.",
        },
        page_number: {
          type: "number",
          description: "The page number to show — must be one of the numbers in that result's `pages` list.",
        },
      },
      required: ["source_reference", "page_number"],
    },
  },
  {
    name: "zoom_to_region",
    description:
      "Zooms into the page image currently shown on the board — use this the way a real tutor points closer at part of a diagram or worksheet while explaining it, not just when asked. Only works while a page image is on the board (no effect on a table, exercise, or vocabulary card). Call zoom_out when you're done looking closely.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description:
            'Optional, approximate: where on the image to focus, described simply and directionally, e.g. "the table on the right", "top-left diagram", "the bottom row". There\'s no pixel-level lookup behind this, so keep it simple and directional rather than highly specific — omit entirely to zoom to the center.',
        },
      },
    },
  },
  {
    name: "zoom_out",
    description: "Returns the currently-shown page image to its default (unzoomed) view. Call this once you're done looking closely at a zoomed-in detail.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "next_page",
    description:
      "Moves the board to the next stored page image within the same document — use when you're walking through a worksheet, exercise, or diagram sequence that continues onto a following page. No parameters: it always acts on whatever page image is currently shown. Has no effect (and returns an error) if there's no page image currently shown, or it's already the last page with an image in that document.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "previous_page",
    description: "Moves the board to the previous stored page image within the same document — the reverse of next_page, same no-parameter usage and constraints.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "scroll_table",
    description: "Scrolls a currently-shown wide table left or right, the way you'd slide a real worksheet under your finger to reveal columns that don't fit on screen at once. Only works while a table is on the board.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["left", "right"],
          description: 'Which way to scroll — "left" jumps to the start of the table, "right" jumps to the end.',
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "highlight_region",
    description:
      "Draws a simple highlight/outline over part of the currently-shown page image or table — use this the way a real tutor circles or points at the exact part they're talking about, e.g. right before explaining a specific number in a table or a detail in a diagram. Not pixel-precise; a short, clear description is enough.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            'A short description of what to highlight and, if useful, roughly where, e.g. "the total row at the bottom", "the triangle on the left". Shown to the child as a label alongside the highlight.',
        },
      },
      required: ["description"],
    },
  },
  {
    name: "draw_marker",
    description:
      "Draws a hand-drawn-style marker — a circle, underline, arrow, or box — over part of the currently-shown page image, the way a real tutor would circle a number or underline a word while talking. Only works while a page image is on the board. Use this constantly as you talk through specific numbers, terms, or exercise parts, not just when asked — see your system instructions for exactly when.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        shape: {
          type: "string",
          enum: ["circle", "underline", "arrow", "box"],
          description:
            'Which mark to draw — "circle" around a number or small detail, "underline" under a word or short phrase, "arrow" pointing at something, "box" around a larger area like a whole row or diagram part.',
        },
        description: {
          type: "string",
          description:
            'What you\'re marking and, if useful, roughly where, e.g. "the answer, 248", "the word for triangle", "the top-right cell". There\'s no pixel-level lookup behind this, so keep it simple and directional rather than highly specific.',
        },
      },
      required: ["shape", "description"],
    },
  },
  {
    name: "show_table",
    description:
      "Renders a data table on the board from real transcribed markdown table text (search_syllabus results already include tables in markdown form when a chunk contains one) — copy that markdown exactly, for any subject. Never invent or reformat table data from memory.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        markdown_table_text: {
          type: "string",
          description:
            'The real markdown table text exactly as it appeared in the retrieved content, e.g. "| Item | Count |\\n| :--- | :--- |\\n| Apples | 12 |".',
        },
      },
      required: ["markdown_table_text"],
    },
  },
  {
    name: "show_exercise",
    description:
      "Displays a real practice question or exercise on the board so the child can read along while working through it with you — use whenever you're working through a specific question together, not just discussing a topic generally. Use the real question text as retrieved; never invent a question.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        question_text: {
          type: "string",
          description: "The real question or exercise prompt text.",
        },
        subparts: {
          type: "array",
          items: { type: "string" },
          description: 'Optional numbered sub-questions, e.g. ["(1) ...", "(2) ..."], shown as a list under the main question.',
        },
      },
      required: ["question_text"],
    },
  },
  {
    name: "show_vocabulary_card",
    description:
      "Displays a large word card on the board when introducing or explaining a new vocabulary word — use proactively whenever you introduce a new word worth the child seeing written out, not just when asked.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        word: {
          type: "string",
          description: "The word being introduced.",
        },
        meaning: {
          type: "string",
          description: "A short, child-friendly explanation of what the word means.",
        },
        language: {
          type: "string",
          description: 'The language the word is in, e.g. "Sinhala", "English", "Tamil".',
        },
      },
      required: ["word", "meaning", "language"],
    },
  },
  {
    name: "clear_board",
    description:
      "Clears whatever is currently shown on the board. Call this when the board's current content is no longer relevant to what you're now discussing — e.g. moving to an unrelated topic — rather than leaving stale visuals up.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
];
