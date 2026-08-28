/**
 * Function declarations exposed to the Gemini Live model. These are sent as
 * part of the (server-locked) session setup and describe the only actions
 * the model can take beyond speaking — searching the syllabus, and recording
 * progress/safety signals for the child's session.
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

export const GEMINI_LIVE_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "search_syllabus",
    description:
      "Looks up official Grade 5 Scholarship Exam syllabus content for a given subject and topic. Always call this before answering any academic question — never answer from memory alone.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description:
            'The subject to search, e.g. "Maths", "Science", "Sinhala", "Environmental Studies".',
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
];
