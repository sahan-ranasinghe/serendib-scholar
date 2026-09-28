"use client";

import { useEffect } from "react";
import { installSingleFire } from "@/lib/singleFire";

/** Mounted once in the root layout: every control in the app fires once per tap (src/lib/singleFire.ts). */
export function SingleFire() {
  useEffect(() => installSingleFire(window), []);
  return null;
}
