import { sinhalaNumberName, sinhalaNumberLexemes } from "@/lib/sinhalaNumber";
const tokens = new Set<string>();
for (let n = 0; n <= 100_000; n += 1) for (const w of sinhalaNumberName(n).split(/\s+/u)) if (w) tokens.add(w);
console.log("distinct spoken tokens across 0..100000:", tokens.size);
const declared = sinhalaNumberLexemes();
const missing = [...tokens].filter((t) => !declared.has(t));
console.log("declared by sinhalaNumberLexemes():", declared.size, "| emitted but NOT declared:", missing.length, missing.slice(0,20));
console.log("\nall tokens:\n" + [...tokens].sort().join(" "));
