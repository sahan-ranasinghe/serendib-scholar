/**
 * THE HARNESS'S OWN IDENTITY (20 Sep 2026).
 *
 * A check is not a child. One headless session walks a whole lesson in
 * twenty minutes and spends hundreds of requests doing it, and a killed
 * run used to leave a browser polling behind it — so the checks kept
 * saturating the 60/min per-IP bucket the app defends a real phone with,
 * and three runs hung on a limit that was never meant for them.
 *
 * A harness sends this header, carrying the value of HARNESS_TOKEN, on
 * every request it makes. src/proxy.ts then counts it in a separate,
 * far larger per-IP bucket.
 *
 * It is a BUDGET, not a door: the header changes which bucket a request
 * is counted in and nothing else — every authentication check in the
 * proxy still applies. With HARNESS_TOKEN unset (the production default)
 * the header is ignored entirely.
 *
 * A constant on its own, with no imports, so the proxy (an edge module)
 * and the CLI checks (scripts/lib/cdp.ts) can share it.
 */
export const HARNESS_HEADER = "x-serendib-harness";
