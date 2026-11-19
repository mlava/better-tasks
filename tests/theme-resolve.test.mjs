import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePanelIsDark, shouldSkipThemeSync } from "../src/core/theme-resolve.js";

// Regression: macOS in dark mode, Roam in its default light theme, no theme
// extension toggle mounted. The OS hint used to win and mark the body
// bt-theme-dark, painting the Today panel's pinned near-white text onto the
// white page. The sampled background (white, luminance 1.0) must win instead.
test("OS dark + Roam light background resolves light", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: null,
      explicitDark: false,
      sampledLuminance: 1.0,
      systemPrefersDark: true,
    }),
    false
  );
});

test("dark background resolves dark even when the OS is light", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: null,
      explicitDark: false,
      sampledLuminance: 0.02,
      systemPrefersDark: false,
    }),
    true
  );
});

test("toggle set to light overrides everything", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: "light",
      explicitDark: true,
      sampledLuminance: 0.02,
      systemPrefersDark: true,
    }),
    false
  );
});

test("toggle set to dark overrides everything", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: "dark",
      explicitDark: false,
      sampledLuminance: 1.0,
      systemPrefersDark: false,
    }),
    true
  );
});

test("bp3-dark marker beats a light sample taken mid theme load", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: null,
      explicitDark: true,
      sampledLuminance: 1.0,
      systemPrefersDark: false,
    }),
    true
  );
});

test("toggle in auto mode defers to the sampled background", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: "auto",
      explicitDark: false,
      sampledLuminance: 1.0,
      systemPrefersDark: true,
    }),
    false
  );
  assert.equal(
    resolvePanelIsDark({
      externalMode: "auto",
      explicitDark: false,
      sampledLuminance: 0.02,
      systemPrefersDark: false,
    }),
    true
  );
});

test("no sample available falls back to the OS hint", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: null,
      explicitDark: false,
      sampledLuminance: null,
      systemPrefersDark: true,
    }),
    true
  );
  assert.equal(
    resolvePanelIsDark({
      externalMode: null,
      explicitDark: false,
      sampledLuminance: null,
      systemPrefersDark: false,
    }),
    false
  );
});

test("NaN luminance is treated as no sample", () => {
  assert.equal(
    resolvePanelIsDark({
      externalMode: null,
      explicitDark: false,
      sampledLuminance: NaN,
      systemPrefersDark: true,
    }),
    true
  );
});

// Regression: a theme-observer class-mutation resync landed with the
// surface-colour heuristic still reporting the pre-flip value even though
// the resolved mode had genuinely changed (dark just activated). Keying the
// skip decision on surface alone made syncDashboardThemeVars return before
// ever reaching classList.toggle("bt-theme-dark", ...) or the six
// custom-property writes, so the panel stayed stuck light while
// bt-theme-dark read true from a stale prior write.
test("shouldSkipThemeSync: skips only when both surface and mode are unchanged", () => {
  assert.equal(
    shouldSkipThemeSync({ forced: false, sameSurface: true, sameMode: true }),
    true
  );
});

test("shouldSkipThemeSync: a mode change always proceeds, even with a same-looking surface sample", () => {
  assert.equal(
    shouldSkipThemeSync({ forced: false, sameSurface: true, sameMode: false }),
    false
  );
});

test("shouldSkipThemeSync: a surface change always proceeds, even with the same resolved mode", () => {
  assert.equal(
    shouldSkipThemeSync({ forced: false, sameSurface: false, sameMode: true }),
    false
  );
});

test("shouldSkipThemeSync: a forced resync (pending toggle click) always proceeds", () => {
  assert.equal(
    shouldSkipThemeSync({ forced: true, sameSurface: true, sameMode: true }),
    false
  );
});

test("shouldSkipThemeSync: defaults to not skipping when called with no arguments", () => {
  assert.equal(shouldSkipThemeSync(), false);
});
