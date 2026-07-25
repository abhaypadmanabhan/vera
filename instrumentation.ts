import { initializeBraintrust } from "@/lib/braintrust/logger";

/** Next.js startup hook — runs once, before any route handler. */
export function register(): void {
  initializeBraintrust();
}
