"use client";

/**
 * The textbook's place-value table with blanks to fill.
 *
 * Vocabulary:
 *   show { rows }                             → columns + rows (null = a blank)
 *   row_activate { row, field }               → activeBlank: the cell is
 *                                               outlined and the pad points at it
 *   cell_fill { row, field, value, by }       → filled: green tick for the
 *                                               child, blue pen for Zara
 *
 * TOUCH: tap a blank cell to answer it on the pad.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HandNumber } from "./HandNumber";
import { NumberPad } from "./NumberPad";
import { WriteOn } from "./WriteOn";
import { isHandWritable } from "./HandGlyphs";
import { useTargetRef } from "./targets";
import type { Filler } from "./events";
import { BOARD, FONT_SINHALA, formatNumber, TOUCH_MIN } from "./theme";

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
  /** Float the answer pad at the board's edge (the lesson's small board). */
  dockPad?: boolean;
  /** A short surface (a phone held sideways): rows the child cannot tap shrink to 30 px, the header to one tight line. */
  dense?: boolean;
}

export function BlankTable({ columns, rows, filled = [], activeBlank = null, interactive = false, onAnswer, dockPad = false, dense = false }: BlankTableProps) {
  const ref = useTargetRef("component:blankTable");
  const [tapped, setTapped] = useState<{ row: number; field: string } | null>(null);
  const active = tapped ?? activeBlank;
  return (
    <div ref={ref} data-testid="blank-table" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "100%" }}>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            borderRadius: 8,
            boxShadow: `0 0 0 3px ${BOARD.markerBlue}`,
            background: "rgba(255,255,255,0.35)",
            fontFamily: FONT_SINHALA,
          }}
        >
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  className="font-sinhala"
                  style={{
                    padding: dense ? "1px 8px" : "3px 10px",
                    fontSize: 16,
                    fontWeight: 700,
                    color: BOARD.ink,
                    borderBottom: `3px solid ${BOARD.markerBlue}`,
                    borderRight: index === columns.length - 1 ? undefined : `2.5px solid ${BOARD.markerBlue}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <motion.tr
                key={rowIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min(rowIndex * 0.08, 0.32) }}
              >
                {columns.map((column, columnIndex) => {
                  // Only a row with a blank the child can tap needs the 48 px
                  // touch height; the others stay compact so six rows fit a
                  // phone held sideways.
                  const rowTouchable = interactive && columns.some((c) => (row[c.key] === null || row[c.key] === undefined) && !filled.some((f) => f.row === rowIndex && f.field === c.key));
                  const fill = filled.find((f) => f.row === rowIndex && f.field === column.key);
                  const printed = row[column.key];
                  const isBlank = printed === null || printed === undefined;
                  const isActive = active?.row === rowIndex && active.field === column.key;
                  return (
                    <Cell
                      key={column.key}
                      row={rowIndex}
                      field={column.key}
                      printed={isBlank ? null : String(printed)}
                      fill={fill ?? null}
                      active={isActive}
                      last={columnIndex === columns.length - 1}
                      lastRow={rowIndex === rows.length - 1}
                      interactive={interactive && isBlank && !fill}
                      compact={!rowTouchable}
                      dense={dense && !rowTouchable}
                      onTap={() => setTapped((t) => (t?.row === rowIndex && t.field === column.key ? null : { row: rowIndex, field: column.key }))}
                    />
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <AnimatePresence>
        {interactive && active && !filled.some((f) => f.row === active.row && f.field === active.field) && (
          <NumberPad
            key={`${active.row}:${active.field}`}
            mode="number"
            docked={dockPad}
            label={`${columns.find((c) => c.key === active.field)?.label ?? active.field} · ${active.row + 1}`}
            onCommit={(value) => {
              onAnswer?.(active.row, active.field, value);
              setTapped(null);
            }}
            onCancel={() => setTapped(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Cell({
  row,
  field,
  printed,
  fill,
  active,
  last,
  lastRow,
  interactive,
  compact,
  dense,
  onTap,
}: {
  row: number;
  field: string;
  printed: string | null;
  fill: FilledCell | null;
  active: boolean;
  last: boolean;
  lastRow: boolean;
  interactive: boolean;
  compact: boolean;
  dense: boolean;
  onTap: () => void;
}) {
  const ref = useTargetRef<HTMLTableCellElement>(`cell:${row}/${field}`);
  const value = fill ? String(fill.value) : printed;
  const colour = fill?.by === "child" ? BOARD.markerGreen : BOARD.markerBlue;
  return (
    <motion.td
      ref={ref}
      data-testid={`cell-${row}-${field}`}
      data-active={active || undefined}
      className={interactive ? "wb-tap" : undefined}
      onClick={interactive ? onTap : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `row ${row + 1} ${field} — tap to answer` : undefined}
      animate={{ boxShadow: active ? `inset 0 0 0 3px ${BOARD.chalkYellow}` : "inset 0 0 0 0px rgba(243,198,75,0)" }}
      transition={{ duration: 0.25 }}
      style={{
        minWidth: TOUCH_MIN + 16,
        minHeight: dense ? 30 : compact ? 36 : TOUCH_MIN,
        height: dense ? 30 : compact ? 36 : TOUCH_MIN,
        padding: dense ? "1px 8px" : "2px 10px",
        textAlign: "center",
        borderRight: last ? undefined : `2.5px solid ${BOARD.markerBlue}`,
        borderBottom: lastRow ? undefined : `2px solid rgba(30,76,153,0.55)`,
        background: active ? BOARD.chalkYellowSoft : undefined,
        position: "relative",
      }}
    >
      {value === null ? null : fill ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {isHandWritable(value) ? (
            <HandNumber key={value} text={formatNumber(value)} size={dense ? 20 : compact ? 22 : 26} color={colour} budgetMs={300} />
          ) : (
            <WriteOn text={value} size={compact ? 17 : 19} color={colour} durationMs={300} />
          )}
          <span aria-hidden style={{ color: colour, fontSize: 15 }}>
            {fill.by === "child" ? "✓" : "✎"}
          </span>
        </span>
      ) : isHandWritable(value) ? (
        <HandNumber text={formatNumber(value)} size={dense ? 20 : compact ? 22 : 26} color={BOARD.ink} draw={false} strokeWidth={4.2} />
      ) : (
        <WriteOn text={value} size={compact ? 16 : 18} color={BOARD.ink} weight={600} write={false} />
      )}
    </motion.td>
  );
}
