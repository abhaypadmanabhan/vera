import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal } from "@/components/landing/reveal";

/** The server's output for a block, with no effect having run — the no-JS artifact. */
const served = (props: Parameters<typeof Reveal>[0]) =>
  renderToStaticMarkup(createElement(Reveal, props));

/**
 * `Reveal` and the `.v-rise` rules in globals.css are one mechanism split across
 * two files, and the split is where it broke: the CSS hid every landing section
 * at `opacity: 0` and the component was the only thing that could ever undo it.
 * With JavaScript off, blocked, or a bundle that never arrived, the whole page
 * was in the DOM and invisible — measured in Chrome with `javaScriptEnabled:
 * false`, 0 of 23 blocks visible, a nav bar over empty space.
 *
 * The contract that replaced it, and what this file holds:
 *
 *   The served HTML is readable on its own. Nothing is hidden until the reveal
 *   code has mounted and stamped `.v-js` on <html> — the hiding is done by the
 *   same code that can undo it.
 *
 * `renderToStaticMarkup` is exactly the artifact in question: the server's
 * output with no effect ever having run. And since the two halves live in
 * different files, the CSS half is asserted structurally rather than trusted.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const css = read("../app/globals.css");
const component = read("../components/landing/reveal.tsx");

/** The balanced `{...}` body of the first block at or after `from`. */
function blockAt(source: string, from: number): string {
  const open = source.indexOf("{", from);
  if (from < 0 || open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

/** Every innermost `selector { declarations }` pair, at any nesting depth. */
function rules(source: string): { selector: string; body: string }[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: { selector: string; body: string }[] = [];
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    found.push({ selector: match[1].trim(), body: match[2] });
  }
  return found;
}

const hidesRise = (rule: { selector: string; body: string }) =>
  rule.selector.includes(".v-rise") && /opacity:\s*0\s*[;}]/.test(rule.body);

describe("the landing page without JavaScript", () => {
  it("serves every reveal block visible — no hidden state in the markup", () => {
    const html = served({ children: "She proves every number." });

    // Nothing in the server's output can put this block at zero opacity: the
    // class is a hook, not a hiding, and there is no inline style to fight.
    expect(html).toContain("v-rise");
    expect(html).toContain("She proves every number.");
    expect(html).not.toContain("data-shown");
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toContain("visibility:hidden");
    expect(html).not.toContain("display:none");
  });

  it("leaves .v-rise at full opacity by default, which is the state CSS alone can reach", () => {
    const ungated = rules(css).filter(
      (rule) => rule.selector === ".v-rise" && !rule.selector.includes(".v-js"),
    );

    expect(ungated.length).toBeGreaterThan(0);
    for (const rule of ungated) {
      expect(rule.body).toMatch(/opacity:\s*1\s*;/);
      expect(rule.body).not.toMatch(/opacity:\s*0\s*[;}]/);
    }
  });

  it("hides a reveal block only behind .v-js, the class the reveal code stamps itself", () => {
    const hiding = rules(css).filter(hidesRise);

    // The rule has to exist — deleting the animation is not the fix.
    expect(hiding.length).toBeGreaterThan(0);
    for (const rule of hiding) {
      expect(
        rule.selector.includes(".v-js"),
        `"${rule.selector}" hides .v-rise without waiting for JavaScript to prove it is there`,
      ).toBe(true);
    }
  });

  it("keeps every hidden state inside prefers-reduced-motion: no-preference", () => {
    const noPreference = blockAt(
      css,
      css.indexOf("@media (prefers-reduced-motion: no-preference)"),
    );
    expect(noPreference).not.toBe("");

    for (const rule of rules(css).filter(hidesRise)) {
      expect(
        noPreference.includes(rule.body),
        `"${rule.selector}" hides .v-rise outside the no-preference query, so a reduced-motion reader gets a blank page`,
      ).toBe(true);
    }
  });

  it("pairs the CSS gate with a component that actually stamps it, from its mount effect", () => {
    expect(css).toContain(".v-js .v-rise");
    expect(component).toContain('document.documentElement.classList.add("v-js")');

    // Inside the effect, not at module scope: a chunk that evaluates but never
    // mounts must not arm a hidden state nothing will lift.
    const effect = component.indexOf("useEffect(");
    const stamp = component.indexOf('classList.add("v-js")');
    expect(effect).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(effect);
  });

  it("writes data-shown to the node, so arming and revealing share one task", () => {
    // A render round-trip between the two gives the browser a frame where every
    // block is armed and none is shown — visible content snapping to blank.
    expect(component).toContain('el.setAttribute("data-shown", "")');
    expect(component).not.toContain("useState");
  });
});

describe("the reveal itself, which the fix must not have cost", () => {
  it("still carries both mechanisms — an observer alone loses anything you jump past", () => {
    // 2026-07-27: 12 of 23 blocks stayed invisible after a jump to the bottom,
    // because a block that crosses the whole viewport in one step has an
    // intersection ratio of 0 before and 0 after and never fires a callback.
    expect(component).toContain("new IntersectionObserver");
    expect(component).toContain('window.addEventListener("scroll", onScroll');
    expect(component).toContain('window.addEventListener("resize", onScroll');
    expect(component).toContain("requestAnimationFrame");
  });

  it("still staggers a group and still forwards layout classes", () => {
    const html = served({ step: 2, className: "mt-10", children: "x" });
    expect(html).toContain("--step:2");
    expect(html).toContain("mt-10");
  });
});
