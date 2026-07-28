"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode, RefObject } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

/**
 * The presenter orb: ElevenLabs' own `Orb` (installed from their shadcn registry
 * into `components/ui/orb.tsx`), retinted to Vera's accent and reduced to three
 * states.
 *
 * It is decorative. Vera's speaking state is announced through the deck's live
 * region, never from here, so the whole thing is `aria-hidden`.
 *
 * The shader only ever runs when there is motion to justify it: no WebGL, or
 * `prefers-reduced-motion: reduce`, and the orb falls back to the static ring —
 * which is also what renders on the server, so the markup is deterministic.
 */
export type PresenterOrbState = "idle" | "speaking" | "stopped";

const Orb = dynamic(() => import("@/components/ui/orb").then((module) => module.Orb), {
  ssr: false,
});

/** Fixed, so the orb looks the same in every run of the demo. */
const ORB_SEED = 20_18;

/**
 * Matches the light-mode `--deck-orb-*` tokens in `app/deck.css`; only used
 * before the first read, and whenever `read()` bails because the custom
 * properties are not resolvable yet.
 *
 * Keep these two literals equal to the `:root` values of `--deck-orb-1` and
 * `--deck-orb-2`. They drifted once already — the comment claimed a match that
 * had not been true since the tokens were retuned, so the pre-read frame
 * flashed a different blue than the one the deck settles on.
 */
const FALLBACK_COLORS: [string, string] = ["#73a3d5", "#caddf2"];

export function PresenterOrb({
  state,
  visible,
  x,
  y,
}: {
  state: PresenterOrbState;
  visible: boolean;
  x: number;
  y: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useOrbColors(ref);
  const motionAllowed = useMotionAllowed();
  const webglSupported = useWebglSupport();
  // Gated on `visible` too: a deck transition keeps the outgoing slide mounted
  // for a beat, and its orb is never shown. One WebGL context, not two.
  const animated = motionAllowed && webglSupported && visible;
  const speaking = state === "speaking";

  return (
    <div
      ref={ref}
      className={cn("presenter-orb", visible && "presenter-orb-visible")}
      data-state={state}
      data-animated={animated ? "" : undefined}
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
      aria-hidden
    >
      <span className="presenter-orb-still" />
      {animated && (
        <OrbBoundary>
          <Suspense fallback={null}>
            <Orb
              className="presenter-orb-canvas"
              colors={colors}
              seed={ORB_SEED}
              agentState={speaking ? "talking" : null}
              // Silent means silent: manual volumes pinned at zero settle the
              // shader instead of letting its idle wander read as a throb.
              volumeMode={speaking ? "auto" : "manual"}
              manualInput={speaking ? undefined : 0}
              manualOutput={speaking ? undefined : 0}
            />
          </Suspense>
        </OrbBoundary>
      )}
    </div>
  );
}

/**
 * three.js parses hex, not `oklch()`, so the accent reaches the shader through
 * two sRGB stops declared beside the other deck orb rules in `app/globals.css`.
 * Re-read on a theme flip so the orb follows light/dark like everything else.
 */
function useOrbColors(ref: RefObject<HTMLDivElement | null>): [string, string] {
  const [colors, setColors] = useState<[string, string]>(FALLBACK_COLORS);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const read = () => {
      const style = window.getComputedStyle(node);
      const first = style.getPropertyValue("--deck-orb-1").trim();
      const second = style.getPropertyValue("--deck-orb-2").trim();
      if (!first || !second) return;
      setColors((current) =>
        current[0] === first && current[1] === second ? current : [first, second],
      );
    };

    read();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => {
      media.removeEventListener("change", read);
      observer.disconnect();
    };
  }, [ref]);

  return colors;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Both of these answer "no motion" on the server and during hydration, so the
 * static ring is always what renders first and the shader only ever arrives as
 * an upgrade.
 */
function useMotionAllowed(): boolean {
  return !useMediaQuery(REDUCED_MOTION, true);
}

function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

function useWebglSupport(): boolean {
  return useSyncExternalStore(subscribeNever, detectWebgl, () => false);
}

function subscribeNever() {
  return () => undefined;
}

let webglSupport: boolean | null = null;

/** Probed once per page: the answer cannot change without a reload. */
function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  if (webglSupport === null) {
    try {
      const probe = document.createElement("canvas");
      webglSupport = Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** A lost WebGL context must never take the deck down mid-presentation. */
class OrbBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
