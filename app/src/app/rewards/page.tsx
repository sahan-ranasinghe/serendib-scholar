import { RewardsRoute } from "@/components/app/routes/routes";

/**
 * `/rewards` — a static shell: the screen renders on the client from the app
 * store (src/lib/appStore.tsx), its skeleton first if the store is cold.
 * No server data here, so the route is prefetchable and every navigation
 * to it is a client-side transition (cluster H).
 */
export default function Page() {
  return <RewardsRoute />;
}
