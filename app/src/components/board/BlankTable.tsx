"use client";

/**
 * The textbook's tables, from the design (rule e2): one skin, two column
 * sets. A paper grid with a 2 px ink-40 border, radius 10, a saffron-soft
 * header row in Yaldevi 600 20, rows of 30 px (34 px in the two-column
 * numeral ↔ name table), Zara's cells in marker blue with a ✎ badge, the
 * child's in green with a ✓, the active cell outlined in saffron on
 * saffron-soft with a green caret. The pad or word bank docks at the foot
 * of the board while a cell is active.
 *
 * Vocabulary:
 *   show { rows }                             → columns + rows (null = a blank)
 *   row_activate { row, field }               → activeBlank
 *   cell_fill { row, field, value, by }       → filled
 *
 * TOUCH: tap a blank cell to answer it on the pad / from the word bank.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { NumberPad } from "./NumberPad";
import { WordBank } from "./WordBank";
import { nameWordBank, PLACE_NAMES } from "@/lib/distractors";
import { useTargetRef } from "./targets";
import type { Filler } from "./events";
import { BOARD, FONT_LABEL, FONT_LATIN, formatNumber } from "./tokens";

export interface TableColumn {
  key: string;
  label: string;
}

export interface FilledCell {
  row: number;
  field: string;
  value: string | number;
  by: Filler;
}

export interface BlankTableProps {
  columns: TableColumn[];
  /** Cell values by column key; null is a blank to fill. */
  rows: Array<Record<string, string | number | null>>;
  filled?: FilledCell[];
  activeBlank?: { row: number; field: string } | null;
  interactive?: boolean;
  onAnswer?: (row: number, field: string, value: string) => void;
  /** Dock the pad / bank at the board's foot (the lesson board). */
  dockPad?: boolean;
  /** Kept for callers: the design has one row height per skin. */
  dense?: boolean;
  /** A sparkle on this cell (the child just filled it). */
  sparkleAt?: { row: number; field: string } | null;
}

const PLACE_TEMPLATE = "1.1fr .8fr 1.7fr 1fr 1.3fr";
const NAME_TEMPLATE = "1fr 2fr";

export function BlankTable({ columns, rows, filled = [], activeBlank = null, interactive = false, onAnswer, dockPad = false, sparkleAt = null }: BlankTableProps) {
  const registerTarget = useTargetRef<HTMLDivElement>("component:blankTable");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      registerTarget(element);
      rootRef.current = element;
    },
    [registerTarget],
  );
  // How much room the table actually has above the dock, and how tall its
  // header wrapped to. On a short phone (800×360, strip 40) the place-value
  // header takes two lines and only one row fits above the pad, so the
  // active row has to scroll right up to the top — the child must be able to
  // see the cell they are filling.
  const [room, setRoom] = useState<{ height: number; head: number } | null>(null);
  useLayoutEffect(() => {
    // The room is the board's content inset, not the wrapper that hugs the table.
    const box = rootRef.current?.closest(".wb-content") as HTMLElement | null;
    if (!box || typeof ResizeObserver === "undefined") return;
    const measure = () => setRoom({ height: box.clientHeight, head: headRef.current?.getBoundingClientRect().height ?? 0 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (headRef.current) observer.observe(headRef.current);
    return () => observer.disconnect();
  }, [columns.length, rows.length]);
  const [tapped, setTapped] = useState<{ row: number; field: string } | null>(null);
  const [draft, setDraft] = useState("");
  const active = tapped ?? activeBlank;
  const nameSkin = columns.length === 2;
  const rowHeight = nameSkin ? 34 : 30;
  const template = nameSkin ? NAME_TEMPLATE : columns.length === 5 ? PLACE_TEMPLATE : columns.map(() => "1fr").join(" ");
  const activeOpen = interactive && active && !filled.some((f) => f.row === active.row && f.field === active.field);
  // While the pad or bank is docked the table shows four rows (three for the
  // name skin) and scrolls the active row into view (M10, G5, G13). "Into
  // view" is measured, not assumed: whatever the room above the dock allows,
  // the active row is the last one drawn in it.
  const windowRows = activeOpen && dockPad ? (nameSkin ? 3 : 4) : rows.length;
  const visibleRows = room && room.height > 0 ? Math.max(1, Math.floor((room.height - room.head) / rowHeight)) : windowRows;
  const firstRow =
    activeOpen && dockPad && active
      ? Math.max(0, Math.min(active.row - Math.min(windowRows, visibleRows) + 1, rows.length - windowRows))
      : 0;
  const shownRows = rows.slice(firstRow, firstRow + windowRows);
  return (
    <div ref={ref} data-testid="blank-table" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "100%", width: nameSkin ? undefined : "100%", overflowX: "auto" }}>
      <div
        data-testid="blank-table-grid"
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: template,
          border: `2px solid ${BOARD.ink40}`,
          borderRadius: 10,
          background: BOARD.paper,
          width: nameSkin ? 560 : "100%",
          maxWidth: "100%",

        }}
      >
        {columns.map((column, index) => (
          <div
            key={column.key}
            ref={index === 0 ? headRef : undefined}
            style={{
              padding: "2px 6px",
              background: BOARD.saffronSoft,
              borderBottom: `2px solid ${BOARD.ink40}`,
              font: `600 20px/${nameSkin ? 1.5 : 1.3} ${FONT_LABEL}`,
              color: BOARD.ink,
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: index === 0 ? "8px 0 0 0" : index === columns.length - 1 ? "0 8px 0 0" : 0,
            }}
          >
            {column.label}
          </div>
        ))}
        {shownRows.map((row, i) => {
          const rowIndex = firstRow + i;
          return columns.map((column) => {
            const fill = filled.find((f) => f.row === rowIndex && f.field === column.key);
            // Her worked row carries one ✎, on its last filled cell (M10, S1, G13).
            const tutorCells = columns.filter((c) => filled.some((f) => f.row === rowIndex && f.field === c.key && f.by === "tutor"));
            const penHere = !!fill && fill.by === "tutor" && tutorCells[tutorCells.length - 1]?.key === column.key;
            const printed = row[column.key];
            const isBlank = printed === null || printed === undefined;
            // Zara outlines the cell (row_activate) whether or not the child may tap yet.
            const isActive = !!active && active.row === rowIndex && active.field === column.key && !fill;
            return (
              <Cell
                key={`${rowIndex}:${column.key}`}
                row={rowIndex}
                field={column.key}
                printed={isBlank ? null : String(printed)}
                fill={fill ?? null}
                active={isActive}
                draft={isActive ? draft : ""}
                height={rowHeight}
                // The outlined cell (row_activate) opens its pad or bank by itself: the 30 px cells are never finger targets (rule 7); the storyboard always outlines the cell to answer.
                interactive={false}
                sparkle={sparkleAt?.row === rowIndex && sparkleAt.field === column.key}
                grouped={nameSkin}
                pen={penHere}
                onTap={() => {
                  setDraft("");
                  setTapped((t) => (t?.row === rowIndex && t.field === column.key ? null : { row: rowIndex, field: column.key }));
                }}
              />
            );
          });
        })}
      </div>
      <AnimatePresence>
        {activeOpen &&
          (() => {
            const label = `${columns.find((c) => c.key === active.field)?.label ?? active.field} · ${active.row + 1}`;
            const commit = (value: string) => {
              onAnswer?.(active.row, active.field, value);
              setTapped(null);
              setDraft("");
            };
            // A number's NAME is written from its word bank, not typed: the
            // row's number gives the words (and two distractors).
            const rowNumber = Number(rows[active.row]?.number);
            // A place-name cell is picked from the place names (one tile is the answer), never typed.
            const bank =
              active.field === "numberName" && Number.isFinite(rowNumber)
                ? nameWordBank(rowNumber, `${rowNumber}:${active.row}`)
                : active.field === "place"
                  ? { tiles: PLACE_NAMES.slice(0, Math.max(4, String(Number.isFinite(rowNumber) ? rowNumber : 0).length)) as unknown as string[] }
                  : null;
            return bank ? (
              <WordBank key={`${active.row}:${active.field}`} tiles={bank.tiles} label={label} docked={dockPad} onCommit={commit} onChange={setDraft} onCancel={() => setTapped(null)} />
            ) : (
              <NumberPad key={`${active.row}:${active.field}`} mode="number" docked={dockPad} label={label} onCommit={commit} onChange={setDraft} onCancel={() => setTapped(null)} />
            );
          })()}
      </AnimatePresence>
    </div>
  );
}

function Cell({ row, field, printed, fill, active, draft, height, interactive, sparkle, grouped = false, pen = false, onTap }: { row: number; field: string; printed: string | null; fill: FilledCell | null; active: boolean; draft: string; height: number; interactive: boolean; sparkle: boolean; grouped?: boolean; pen?: boolean; onTap: () => void }) {
  const ref = useTargetRef<HTMLDivElement>(`cell:${row}/${field}`);
  const value = fill ? String(fill.value) : printed;
  const byChild = fill?.by === "child";
  const colour = fill ? (byChild ? BOARD.successText : BOARD.markerBlue) : active ? BOARD.successText : BOARD.ink;
  // The place-value table prints its numbers plain (2348); the name table groups them (6 528); a blank is the dotted line.
  const shown = value === null ? (active ? draft : interactive || fill ? "" : "……") : grouped && /^\d{4,}$/u.test(value) ? formatNumber(value) : value;
  return (
    <motion.div
      ref={ref}
      data-testid={`cell-${row}-${field}`}
      data-active={active || undefined}
      data-filled-by={fill?.by}
      className={interactive ? "wb-tap" : undefined}
      onClick={interactive ? onTap : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `row ${row + 1} ${field} — tap to answer` : undefined}
      animate={{ boxShadow: active ? `inset 0 0 0 3px ${BOARD.chalkYellow}` : "inset 0 0 0 0px rgba(233,180,76,0)", backgroundColor: active ? BOARD.saffronSoft : "rgba(255,253,248,0)" }}
      transition={{ duration: 0.25 }}
      style={{
        position: "relative",
        height,
        minHeight: interactive ? 30 : undefined,
        padding: "0 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        font: `600 20px/1.5 ${FONT_LABEL}`,
        color: colour,
        borderTop: `1px solid ${BOARD.ink18}`,
        whiteSpace: "nowrap",

      }}
    >
      <span>{shown}</span>
      {fill && byChild && <span style={{ width: 22, height: 22, borderRadius: "50%", background: BOARD.markerGreen, color: "#fff", font: `700 16px/22px ${FONT_LATIN}`, textAlign: "center" }}>✓</span>}
      {fill && !byChild && pen && <span style={{ width: 20, height: 20, borderRadius: "50%", background: BOARD.markerBlue, color: "#fff", font: `16px/20px ${FONT_LATIN}`, textAlign: "center" }}>✎</span>}
      {active && <span data-testid="cell-caret" style={{ width: 2, height: 22, background: BOARD.successText }} />}
      {sparkle && (
        <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {[["-6px", "-6px"], ["96%", "-6px"], ["50%", "-10px"], ["-4px", "70%"], ["100%", "60%"], ["30%", "100%"]].map(([x, y], i) => (
            <span key={i} style={{ position: "absolute", left: x, top: y, width: 8, height: 8, background: BOARD.chalkYellow, transform: "rotate(45deg)", opacity: 1 - i * 0.1 }} />
          ))}
        </span>
      )}
    </motion.div>
  );
}
