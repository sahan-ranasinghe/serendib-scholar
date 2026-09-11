import { EdgeState } from "@/components/app/EdgeState";

/** The service worker's fallback for a navigation with no network (Screens B · Offline). */
export default function OfflinePage() {
  return <EdgeState kind="offline" ctaHref="/home" style={{ minHeight: "100dvh" }} />;
}
