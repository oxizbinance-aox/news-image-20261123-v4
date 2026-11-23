// The World in One Page — 23 November 2026.
// A deterministic 1024x1024 newspaper front page: 6 hero cards + 29 brief
// items = 35 stories across 7 regions, drawn with a hand-authored 5x7
// bitmap font and code-drawn pictograms. Node 22+, zero dependencies.
// Output: $MAKEFUN_OUTPUT_DIR/entry.png (default: ./out/entry.png).
// Two runs write byte-identical PNGs (fixed zlib level, no time/random).

import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [246, 241, 231];
const CARD: RGB = [255, 255, 255];
const INK: RGB = [22, 26, 34];
const GREY: RGB = [74, 82, 98];
const RED: RGB = [179, 39, 30];
const NAVY: RGB = [29, 62, 110];
const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [201, 162, 39];
const ORANGE: RGB = [232, 120, 40];
const GREEN: RGB = [30, 107, 74];
const PURPLE: RGB = [91, 45, 142];
const TEAL: RGB = [15, 118, 110];
const BLUE: RGB = [29, 78, 137];
const DARKRED: RGB = [142, 43, 37];
const SLATE: RGB = [51, 48, 46];

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPx(i, j, c);
}
function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = x0; x <= x1; x++) setPx(x, y, c);
}
function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) setPx(x, y, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    if (thick === 1) setPx(x, y, c);
    else fillRect(x - 1, y - 1, 2, 2, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function polyline(pts: Array<[number, number]>, c: RGB, thick = 1): void {
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, thick);
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    hline(cx - dx, cx + dx, cy + dy, c);
  }
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    fillRect(Math.round(cx + Math.cos(t) * r) - 1, Math.round(cy + Math.sin(t) * r) - 1, 2, 2, c);
  }
}
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const pts: Array<[number, number]> = [[ax, ay], [bx, by], [cx, cy]].sort((p, q) => p[1] - q[1]);
  const [x0, y0] = pts[0], [x1, y1] = pts[1], [x2, y2] = pts[2];
  const lerp = (xa: number, ya: number, xb: number, yb: number, y: number): number =>
    yb === ya ? xa : xa + ((xb - xa) * (y - ya)) / (yb - ya);
  for (let y = y0; y <= y2; y++) {
    const xa = lerp(x0, y0, x2, y2, y);
    const xb = y <= y1 ? lerp(x0, y0, x1, y1, y) : lerp(x1, y1, x2, y2, y);
    hline(Math.round(Math.min(xa, xb)), Math.round(Math.max(xa, xb)), y, c);
  }
}
function strokeRect(x: number, y: number, w: number, h: number, c: RGB): void {
  hline(x, x + w - 1, y, c); hline(x, x + w - 1, y + h - 1, c);
  vline(x, y, y + h - 1, c); vline(x + w - 1, y, y + h - 1, c);
}

// ------------------------------------------------------------------- font
// Hand-authored 5x7 bitmap font, uppercase + digits + punctuation.
// Each glyph: 7 rows, 5 bits each (bit 4 = leftmost pixel).
const GLYPHS: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  "%": [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "·": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  "•": [0, 0x04, 0x0e, 0x0e, 0x04, 0, 0],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
};

const warnedGlyphs = new Set<string>();
const warnings: string[] = [];

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  // The font is uppercase-only: normalise case and dashes at render time
  // so story text stays readable in the data while the page stays uniform.
  s = s.toUpperCase().replace(/—/g, "-").replace(/–/g, "-");
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (!g) {
      if (!warnedGlyphs.has(ch)) { warnedGlyphs.add(ch); warnings.push("missing glyph: " + JSON.stringify(ch)); }
    } else {
      for (let r = 0; r < 7; r++) {
        const bits = g[r];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}
function drawTextCentered(s: string, y: number, scale: number, c: RGB): void {
  drawText(s, Math.round((W - textWidth(s, scale)) / 2), y, scale, c);
}
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (textWidth(next, scale) <= maxW) cur = next;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// -------------------------------------------------------------- pictograms
// Each draws inside a hero card's picture band: centre x, band top y.
function pictoTanker(cx: number, by: number): void {
  // sea mine top-right, burning tanker centre
  fillCircle(cx + 96, by + 20, 7, INK);
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    line(cx + 96, by + 20, Math.round(cx + 96 + Math.cos(t) * 13), Math.round(by + 20 + Math.sin(t) * 13), INK);
  }
  fillTriangle(cx - 8, by + 34, cx + 8, by + 34, cx, by + 14, GOLD);
  fillTriangle(cx - 4, by + 34, cx + 4, by + 34, cx, by + 22, WHITE);
  fillRect(cx - 62, by + 22, 30, 12, GOLD);
  fillRect(cx - 26, by + 22, 30, 12, WHITE);
  fillRect(cx + 10, by + 22, 30, 12, [140, 190, 220]);
  fillRect(cx + 48, by + 12, 14, 22, WHITE);
  fillRect(cx - 72, by + 34, 144, 20, [20, 30, 45]);
  fillTriangle(cx + 72, by + 34, cx + 72, by + 54, cx + 92, by + 44, [20, 30, 45]);
  hline(cx - 84, cx + 84, by + 60, WHITE);
  hline(cx - 60, cx + 60, by + 66, WHITE);
}
function pictoGlobe(cx: number, by: number): void {
  fillCircle(cx, by + 38, 24, PAPER);
  circle(cx, by + 38, 24, INK);
  vline(cx, by + 14, by + 62, INK);
  hline(cx - 24, cx + 24, by + 38, INK);
  polyline([[cx - 20, by + 16], [cx - 8, by + 28], [cx - 16, by + 40], [cx - 2, by + 52], [cx + 10, by + 60]], RED, 2);
  fillCircle(cx + 58, by + 16, 8, GOLD);
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    line(Math.round(cx + 58 + Math.cos(t) * 11), Math.round(by + 16 + Math.sin(t) * 11),
      Math.round(cx + 58 + Math.cos(t) * 15), Math.round(by + 16 + Math.sin(t) * 15), GOLD);
  }
}
function pictoFlags(cx: number, by: number): void {
  const cols: RGB[] = [RED, BLUE, GOLD];
  const offs = [-56, 0, 56];
  for (let i = 0; i < 3; i++) {
    vline(cx + offs[i], by + 14, by + 58, WHITE);
    fillRect(cx + offs[i], by + 14, 30, 16, cols[i]);
  }
  hline(cx - 80, cx + 80, by + 58, WHITE);
  fillRect(cx - 70, by + 58, 140, 4, WHITE);
}
function pictoCapitol(cx: number, by: number): void {
  vline(cx, by + 6, by + 18, WHITE);
  fillRect(cx, by + 8, 14, 8, RED);
  fillCircle(cx, by + 40, 22, WHITE);
  fillRect(cx - 22, by + 40, 44, 22, DARKRED);
  fillRect(cx - 22, by + 40, 44, 8, WHITE);
  for (const dx of [-20, -8, 4, 16]) fillRect(cx + dx, by + 48, 5, 16, WHITE);
  fillRect(cx - 30, by + 64, 60, 5, WHITE);
}
function pictoChart(cx: number, by: number): void {
  vline(cx - 70, by + 12, by + 60, WHITE);
  hline(cx - 70, cx + 80, by + 60, WHITE);
  const bars: Array<[number, number, number]> = [[-56, 20, 18], [-30, 30, 16], [-4, 42, 14]];
  for (const [dx, top, h] of bars) {
    fillRect(cx + dx, by + top, 10, h, [220, 60, 50]);
    vline(cx + dx + 5, by + top - 6, by + top + h + 4, [220, 60, 50]);
  }
  polyline([[cx - 60, by + 16], [cx - 24, by + 30], [cx + 8, by + 44], [cx + 44, by + 52], [cx + 70, by + 56]], GOLD, 2);
  fillTriangle(cx + 70, by + 56, cx + 58, by + 50, cx + 62, by + 62, GOLD);
}
function pictoZeta(cx: number, by: number): void {
  hline(cx - 75, cx + 75, by + 44, WHITE);
  vline(cx - 70, by + 14, by + 60, WHITE);
  const pts: Array<[number, number]> = [];
  for (let t = 0; t <= 132; t += 4) pts.push([cx - 60 + t, Math.round(by + 44 - Math.sin(t / 14) * 16)]);
  polyline(pts, GOLD, 2);
  for (const t of [0, 44, 88, 132]) fillCircle(cx - 60 + t, by + 44, 3, WHITE);
}

// -------------------------------------------------------------------- data
interface Hero { kicker: string; headline: string; deck: string; band: RGB; accent: RGB; picto: string; }
const HEROES: Hero[] = [
  { kicker: "MIDDLE EAST · GULF WAR", headline: "TWO TANKERS BLOW UP ON MINES IN THE STRAIT",
    deck: "IRGC SAYS SHIPS HIT MINES; 25 TANKERS STRUCK IN A WEEK.", band: DARKRED, accent: DARKRED, picto: "tanker" },
  { kicker: "CLIMATE · ANTALYA", headline: "COP31 COLLAPSES: NO DEAL ON FOSSIL FUELS",
    deck: "EU REJECTS DRAFT PACT; TALKS END IN DEEP DIVISION.", band: GREEN, accent: GREEN, picto: "globe" },
  { kicker: "DIPLOMACY · CHINA", headline: "TRUMP, PUTIN AND XI MEET IN SHENZHEN",
    deck: "THREE LEADERS ISSUE A 'DECLARATION TOWARD PEACE'.", band: PURPLE, accent: PURPLE, picto: "flags" },
  { kicker: "USA · MIDTERMS", headline: "DEMOCRATS WIN BIGGEST HOUSE MAJORITY SINCE 1992",
    deck: "NORTH CAROLINA RECOUNT FLIPS THE SEAT; 258 SEATS.", band: NAVY, accent: NAVY, picto: "capitol" },
  { kicker: "MARKETS · AI ROUT", headline: "AI SELL-OFF SHAKES WORLD MARKETS",
    deck: "KOSPI DIVES 5%; FUTURES REBOUND AS BUYERS RETURN.", band: SLATE, accent: RED, picto: "chart" },
  { kicker: "SCIENCE · MATHS", headline: "RIEMANN SOLVED? ANTHROPIC CLAIMS PROOF",
    deck: "MATHEMATICIAN + CLAUDE SAY 160-YEAR PUZZLE IS CRACKED.", band: TEAL, accent: TEAL, picto: "zeta" },
];

interface Item { n: number; lead: string; rest: string; }
interface Region { name: string; color: RGB; items: Item[]; }
const REGIONS: Region[] = [
  { name: "EUROPE", color: NAVY, items: [
    { n: 7, lead: "KYIV BOY, 7, PULLED ALIVE", rest: "rescued from rubble hours after Russian strike" },
    { n: 8, lead: "LAGARDE TO QUIT", rest: "ECB president to step down in February 2027" },
    { n: 9, lead: "FRENCH STUDENTS TO PROTEST", rest: "nationwide rallies over education reforms" },
    { n: 10, lead: "LISBON MARCHES", rest: "thousands protest rising living costs in Portugal" },
    { n: 11, lead: "ISTANBUL RALLIES", rest: "thousands protest against media takeover" },
  ]},
  { name: "MIDDLE EAST", color: DARKRED, items: [
    { n: 12, lead: "US DRONE DOWN", rest: "IRGC says it shot down a US MQ-1 Predator near Hormuz" },
    { n: 13, lead: "HOUTHIS CLAIM SAUDI REFINERY HIT", rest: "attack claimed on Sunday" },
    { n: 14, lead: "ISRAEL WARNS NETANYAHU", rest: "IDF: Iran strike could ignite wider regional war" },
    { n: 15, lead: "BAHRAIN HIT", rest: "Bahraini and Pakistani hurt in Iranian attacks" },
  ]},
  { name: "ASIA", color: [150, 110, 20], items: [
    { n: 16, lead: "NEPAL PM IN DELHI", rest: "Balen Shah begins first bilateral visit, meets Modi" },
    { n: 17, lead: "INDIA-CHINA TALKS", rest: "10-day talks to ease LAC tensions in Arunachal" },
    { n: 18, lead: "KOREA'S $1 TRILLION", rest: "annual exports top $1tn for the first time" },
    { n: 19, lead: "TAIWAN WHIPLASH", rest: "stocks swing 1,578 points intraday; TSMC up 2%" },
    { n: 20, lead: "INDONESIA FIRE", rest: "7 bodies found, 50 missing after factory blaze" },
    { n: 21, lead: "MONGOLIA SHAKE-UP", rest: "parliament approves the president's resignation" },
  ]},
  { name: "NORTH AMERICA", color: [47, 93, 58], items: [
    { n: 22, lead: "SKUBAL'S $450M", rest: "Mets agree record nine-year deal for ace pitcher" },
    { n: 23, lead: "LARKIN TRADED", rest: "Red Wings send ex-captain to Montreal in blockbuster" },
    { n: 24, lead: "ICE OUTRAGE", rest: "father and daughter detained at Seattle-Tacoma airport" },
    { n: 25, lead: "IOWA BLAST PLAN", rest: "US Army to detonate bomb chemicals under emergency powers" },
    { n: 26, lead: "ALCARAZ TRIUMPHS", rest: "Spaniard wins first ATP Finals title, beats Zverev" },
  ]},
  { name: "LATIN AMERICA", color: [122, 62, 157], items: [
    { n: 27, lead: "EL CHAPO ISIDRO", rest: "from small-time trafficker to FBI most-wanted: the rise" },
    { n: 28, lead: "PERU QUAKE", rest: "magnitude 6.7 shakes the Andes; no casualties reported" },
    { n: 29, lead: "COLOMBIA v X", rest: "Bogota asks X to suspend ex-president Petro's account" },
  ]},
  { name: "AFRICA", color: [160, 82, 45], items: [
    { n: 30, lead: "BAYELSA TOLL 29", rest: "Tinubu gives N250m to families of boat victims" },
    { n: 31, lead: "KENYA-DRC THAW", rest: "Nairobi and Kinshasa restore full diplomatic ties" },
    { n: 32, lead: "AKA INQUEST ROW", rest: "rapper's father challenges 'one-sided' inquest" },
  ]},
  { name: "OCEANIA · SPORT · TECH", color: TEAL, items: [
    { n: 33, lead: "AI v CANCER", rest: "NHS launches world's largest AI breast-screening trial" },
    { n: 34, lead: "ANTHROPIC SLIDES", rest: "shares retreat after record IPO minted billionaires" },
    { n: 35, lead: "UK 2035", rest: "FIFA to confirm Britain as Women's World Cup host" },
  ]},
];

// ------------------------------------------------------------------ layout
function drawHeroCard(h: Hero, x: number, y: number, idx: number): void {
  const W2 = 320, H2 = 196;
  fillRect(x, y, W2, H2, CARD);
  strokeRect(x, y, W2, H2, INK);
  fillRect(x + 1, y + 1, W2 - 2, 72, h.band);
  drawText(String(idx + 1), x + 10, y + 10, 2, WHITE);
  const cx = x + W2 / 2;
  if (h.picto === "tanker") pictoTanker(cx, y + 1);
  else if (h.picto === "globe") pictoGlobe(cx, y + 1);
  else if (h.picto === "flags") pictoFlags(cx, y + 1);
  else if (h.picto === "capitol") pictoCapitol(cx, y + 1);
  else if (h.picto === "chart") pictoChart(cx, y + 1);
  else pictoZeta(cx, y + 1);
  drawText(h.kicker, x + 12, y + 82, 1, h.accent);
  const headLines = wrapText(h.headline, W2 - 24, 2);
  let hy = y + 98;
  for (const ln of headLines) { drawText(ln, x + 12, hy, 2, INK); hy += 17; }
  const deckLines = wrapText(h.deck, W2 - 24, 1);
  let dy = y + H2 - 12 - deckLines.length * 10;
  fillRect(x + 12, dy - 6, W2 - 24, 1, [200, 192, 175]);
  for (const ln of deckLines) { drawText(ln, x + 12, dy, 1, GREY); dy += 10; }
  if (headLines.length > 3 || deckLines.length > 2) warnings.push("hero overflow: " + h.headline);
}

function drawRegionColumn(regions: Region[], x: number, y0: number, colW: number): number {
  let y = y0;
  for (const r of regions) {
    const chipW = textWidth(r.name, 1) + 14;
    fillRect(x, y, chipW, 20, r.color);
    drawText(r.name, x + 7, y + 6, 1, WHITE);
    y += 25;
    for (const it of r.items) {
      const num = String(it.n) + ".";
      let ix = x;
      drawText(num, ix, y, 1, RED);
      ix += textWidth(num + " ", 1);
      drawText(it.lead, ix, y, 1, INK);
      ix += textWidth(it.lead, 1);
      const rest = " - " + it.rest;
      drawText(rest, ix, y, 1, GREY);
      const total = textWidth(num + " " + it.lead + rest, 1);
      if (total > colW) warnings.push("item " + it.n + " overflows by " + (total - colW) + "px");
      y += 21;
    }
    y += 4;
  }
  return y;
}

function compose(): void {
  fillRect(0, 0, W, H, PAPER);
  // masthead
  drawTextCentered("THE WORLD IN ONE PAGE", 14, 4, INK);
  fillRect(16, 56, 992, 28, NAVY);
  drawTextCentered("MONDAY 23 NOVEMBER 2026 · 35 STORIES · 7 REGIONS", 63, 2, WHITE);
  fillRect(16, 92, 992, 2, INK);
  // heroes: 3 x 2
  const hx = [16, 352, 688];
  const hy = [100, 304];
  for (let i = 0; i < 6; i++) drawHeroCard(HEROES[i], hx[i % 3], hy[Math.floor(i / 3)], i);
  // brief header
  drawText("THE DAY IN BRIEF", 16, 516, 2, INK);
  fillRect(16, 536, 992, 2, INK);
  // brief items, two columns
  const endA = drawRegionColumn(REGIONS.slice(0, 3), 16, 548, 488);
  const endB = drawRegionColumn(REGIONS.slice(3), 520, 548, 488);
  const endY = Math.max(endA, endB);
  if (endY > 962) warnings.push("items end at y=" + endY);
  // footer
  fillRect(16, 966, 992, 1, INK);
  drawTextCentered("SOURCES: BBC · THE HINDU · CHINA DAILY ASIA · TRENDS MENA · FEEDCAST · SIMPLELIFE · ONETURN", 976, 1, GREY);
  drawTextCentered("MUNICH EYE · AFRICAFRONTPAGE · THE STAR · HUDDLEWORLD · MATRIX NEWS — ALL 35 STORIES FIRST REPORTED 23 NOVEMBER 2026", 990, 1, GREY);
}

// --------------------------------------------------------------------- png
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------------- main
function main(): void {
  compose();
  const png = encodePng();
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || join(here, "out");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(JSON.stringify({ file: outPath, bytes: png.length, sha256: sha, warnings }));
}
main();
