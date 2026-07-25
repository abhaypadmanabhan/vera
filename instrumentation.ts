import { initLogger } from "braintrust";

/** Next.js startup hook — runs once, before any route handler. */
export function register(): void {
  initLogger({ projectName: "My Project" });
}
