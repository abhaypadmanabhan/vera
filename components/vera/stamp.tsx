/**
 * The verdict stamp. Mono, letterspaced, red hairline box, slightly askew, lands
 * once. The word is always present — meaning is never carried by colour alone.
 */
export function Stamp({ children }: { children: string }) {
  return (
    <p className="shrink-0">
      <span className="v-stamp v-stamped">{children}</span>
    </p>
  );
}
