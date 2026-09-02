/**
 * Regression tests for extractPrintedPageNumber (see ingest-syllabus.ts).
 * Uses Node's built-in test runner — no new dependency needed.
 *
 * Run with:  npx tsx --test scripts/ingest-syllabus.test.ts
 *
 * Each case's transcribed-text fixture is taken verbatim (footer context
 * only) from real Gemini vision output on maths_5_sinhala.pdf, found while
 * auditing printed_page_number for offset consistency across all ingested
 * rows (page_number - printed_page_number should be a constant per file).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPrintedPageNumber, PRINTED_PAGE_FOOTER_PHRASE as PHRASE } from "./ingest-syllabus";

test("front-matter page with no footer at all returns null", () => {
  assert.equal(extractPrintedPageNumber("4 පිළිතුරු සපයන්න.\n\n**උදාහරණය**"), null);
});

test("plain inline footer: number immediately before the phrase", () => {
  const text = `...end of paragraph.\n\n<div align="right"> <b>3</b><br> ${PHRASE} </div>\n\nHere is the accurate transcription`;
  assert.equal(extractPrintedPageNumber(text), 3);
});

test("plain inline footer: number after the phrase separated by a pipe", () => {
  const text = `... 76 735, 76 729, 76 738\n\n--- **6** | ${PHRASE}\n\nමෙන්න පිටුවේ අඩංගු පෙළ`;
  assert.equal(extractPrintedPageNumber(text), 6);
});

test("number after the phrase with a translation gloss in between, not a nearer unrelated digit further up the page", () => {
  const text = `) $$ \\begin{array}{r@{\\quad}cccc} & 9 & 5 & 0 & 6 \\\\\\\\ - & 2 & 4 & 3 & 2 \\\\\\\\ \\hline \\\\\\\\ \\hline\\hline \\end{array} $$\n\n---\n\n**${PHRASE}** (For free distribution) **17**\n\nHere `;
  assert.equal(extractPrintedPageNumber(text), 17);
});

test("regression: 3-digit number truncated to its last digits by a naive fixed-width window (real bug, page 118 -> was 8, should be 108)", () => {
  const text = `...ගැටලු විසඳන්න.**\n\n---\n\n[Diagram: A page footer illustration showing a child reading a book alongside the page number 108 and the Sinhala text "${PHRASE}" (For free distribution).]\n\nHere is the complete transcription`;
  assert.equal(extractPrintedPageNumber(text), 108);
});

test("regression: 3-digit number truncated to its last two digits (real bug, page 136 -> was 26, should be 126 — the originally reported bug)", () => {
  const text = `...left corner, there is a small decorative illustration showing children standing near a fence beside a page number box with "126" and text that reads "${PHRASE}" (For free distribution).]\n\nHere is the accurate Sinhala text transcription`;
  assert.equal(extractPrintedPageNumber(text), 126);
});

test("regression: HTML attribute value picked as a decoy over the real number (real bug, page 75 -> was 1, should be 65)", () => {
  const text = `| D | ........................ | ........................ |\n\n---\n\n<div align="right"> <table> <tr> <td>${PHRASE}</td> <td border="1"><b>65</b></td> </tr> </table> </div>\n\nHere is the transcrip`;
  assert.equal(extractPrintedPageNumber(text), 65);
});

test("diagram narration: number appears in prose after the phrase, well outside a small window (page 103 -> 93)", () => {
  const text = `... | .......... | ...... |\n\n---\n\n[Diagram: A page footer with text "${PHRASE}" (For free distribution) and the page number "93" inside a small illustrated graphic showing two children at a desk.]\n\n(2) බිල්පත සම්පූර්ණ කරන්න.`;
  assert.equal(extractPrintedPageNumber(text), 93);
});

test("diagram narration: number appears in prose before the phrase, well outside a small window (page 62 -> 52)", () => {
  const text = `...bottom left corner showing two school children standing next to a sign with the page number 52, with text below reading "${PHRASE}" (For free distribution).]\n\nHere is the`;
  assert.equal(extractPrintedPageNumber(text), 52);
});

test("diagram narration: phrase sits just outside the bracket, right after it closes (page 71 -> 61)", () => {
  const text = `[Diagram: In the bottom right corner, there is a page number box displaying "61" alongside a small illustration of school children.]\n\n${PHRASE}\n\nHere is the transcription of the page:`;
  assert.equal(extractPrintedPageNumber(text), 61);
});

test("does not use an unrelated earlier bracket's number when the real number is inline right next to the phrase (page 85 -> 75, not 4 from an unrelated 'ඇමුණුම 4' diagram much earlier)", () => {
  const text =
    `**සිලින්ඩරය**\n\n[Diagram: A pink 3D cylinder illustration representing a cylinder (සිලින්ඩරය).]\n\n` +
    `* ඇමුණුම 4 රූපය කපා ඝන කඩදාසියක අලවා ගන්න. * A, B, C කොටස් තුන වෙන වෙන ම කපා ගන්න. * ඒවා භාවිත කර සිලින්ඩරය සකසා ගන්න.\n\n` +
    `--- **${PHRASE}** | **75**\n\nHere is the trans`;
  assert.equal(extractPrintedPageNumber(text), 75);
});

test("phrase not present at all returns null (not a false match on unrelated numbers)", () => {
  const text = "(1) බස් රථයක මඟින් 58 දෙනෙකුට ගමන් කළ හැකි ය. (4) එවැනි පේළි 116ක ඇති මුළු පුටු ගණන කීය ද?";
  assert.equal(extractPrintedPageNumber(text), null);
});
