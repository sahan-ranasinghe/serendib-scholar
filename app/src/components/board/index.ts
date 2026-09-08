/**
 * The whiteboard design system — see docs/design/board-vocabulary.md for
 * the contract each primitive implements, and /admin/board-gallery for
 * every primitive in every state.
 */
export { Whiteboard, type WhiteboardProps, type Viewport } from "./Whiteboard";
export { Abacus, type AbacusProps } from "./Abacus";
export { PlaceValueStrip, type PlaceValueStripProps } from "./PlaceValueStrip";
export { Expansion, partValue, type ExpansionProps, type ExpansionFlight } from "./Expansion";
export { DigitPicker, type DigitPickerProps } from "./DigitPicker";
export { NumberCards, type NumberCardsProps } from "./NumberCards";
export { ChalkText, tokenize, numbersIn, type ChalkTextProps } from "./ChalkText";
export { Pointer, type PointerProps } from "./Pointer";
export { Highlight, type HighlightProps } from "./Highlight";
export { Money, type MoneyProps, type MoneyItem } from "./Money";
export { TitleCard, TextCard, type TitleCardProps, type TextCardProps } from "./Cards";
export { BlankTable, type BlankTableProps, type TableColumn, type FilledCell } from "./BlankTable";
export { FeedbackFX, type FeedbackFXProps, type FeedbackKind } from "./FeedbackFX";
export { NumberPad, type NumberPadProps } from "./NumberPad";
export { HandNumber, type HandNumberProps } from "./HandNumber";
export { WriteOn, type WriteOnProps } from "./WriteOn";
export { GLYPHS, isGlyph, isHandWritable } from "./HandGlyphs";
export { BOARD, ROD_LABELS, PLACES_4, SPRING, SPRING_BOUNCY, SPRING_SNAPPY, MAX_MS, TOUCH_MIN, FONT_SINHALA, formatNumber, rodOfPlace, placeOfDigit, type Place } from "./theme";
export { playSound, setMuted, isMuted, useMuted, type SoundName } from "./sound";
export { targetKey, candidateKeys, useBoard, useTargetRef, useTargetRect, BoardContext, type BoardRegistry, type Rect } from "./targets";
export { VOCABULARY, DURATION_MS, IMPLEMENTED, TARGET_KINDS, eventName, type BoardEvent, type Target, type Primitive, type EventName, type Filler } from "./events";
