// San Velocita's look for videos: the game's "neon signal" UI (docs/DESIGN.md, marketing/BRAND.md) carried over.
// Type is drawn the game's way: no crisp fill, just two blurred copies of itself in its own colour.
import React from "react";
import { AbsoluteFill, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const C = {
  hotTop: "#ff8a2a", hot: "#ff6a1c", hotDeep: "#ff3d0c", red: "#ff2b00", redDim: "#c93216",
  amber: "#ffc21a", blue: "#2d36f2", ink: "#05060c", plate: "rgba(6, 4, 10, .58)",
  signal: "linear-gradient(90deg, #a9b0ff 0%, #6a72ff 30%, #2d36f2 65%, #5a1fd6 100%)",
};
export const F = { display: "SV Display", ui: "SV UI", body: "SV Body", num: "SV Num" };
// the game's glow: text-shadow in currentColor, fill transparent (soft and lit, never razor sharp, never a dark shadow)
export const glow = (strong = false): React.CSSProperties => ({
  textShadow: strong ? "0 0 .04em currentColor, 0 0 .1em currentColor" : "0 0 .025em currentColor, 0 0 .06em currentColor",
  WebkitTextFillColor: "transparent", letterSpacing: "-0.02em",
});

// fonts: the game's own files, loaded before the first frame renders
const FACES: [string, string, number][] = [["SV UI", "SVUI-500.woff2", 500], ["SV Body", "SVBody-500.woff2", 500], ["SV Display", "SVDisplay-700.woff2", 700], ["SV Num", "SVNum-500.woff2", 500]];
let fontsLoaded: Promise<void> | null = null;
export const useBrandFonts = () => {
  const [handle] = React.useState(() => delayRender("brand fonts"));
  React.useEffect(() => {
    fontsLoaded ||= Promise.all(FACES.map(async ([fam, file, w]) => {
      const f = new FontFace(fam, `url(${staticFile("fonts/" + file)}) format("woff2")`, { weight: String(w) });
      document.fonts.add(await f.load());
    })).then(() => undefined);
    fontsLoaded.then(() => continueRender(handle));
  }, [handle]);
};

// A narrated sentence: snaps in, sits in a fixed slot above the platform buttons (bottom 22% kept clear), on a dark
// plate so it reads over any footage. One word may be amber (BRAND §2: one amber thing per frame).
export const Caption: React.FC<{ text: string; amber?: string }> = ({ text, amber }) => {
  const words = text.split(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 1920 * 0.25 }}>
      <div style={{ maxWidth: 860, padding: "18px 30px 20px", background: C.plate, textAlign: "center",
        fontFamily: F.body, fontWeight: 500, fontSize: 50, lineHeight: 1.18, color: C.red, textWrap: "balance", ...glow() }}>
        {words.map((w, i) => (
          <span key={i} style={amber && w.replace(/[^\w']/g, "").toLowerCase() === amber.toLowerCase() ? { color: C.amber } : undefined}>
            {w}{i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// The game's own tire colours (HUD car diagram): dull when cold, SV blue in the window, orange to pink when hot.
export const tireColour = (t: number, best: number) => {
  const d = t - best;
  if (d < -25) return "#5a5f73"; // cold: dull
  if (d < -10) return "#4a55c8"; // coming in
  if (d <= 12) return C.blue;    // in the window
  if (d <= 22) return "#ff8a2a"; // hot
  return "#ff3d8a";              // overheating: pink
};

// Four tires, surface over core, live from the director's per-frame log. Top left, fixed slot, nothing moves.
export const TireReadout: React.FC<{ data: { best: number; s: number[][]; c: number[][] }; from?: number }> = ({ data, from = 0 }) => {
  const frame = useCurrentFrame();
  const i = Math.min(data.s.length - 1, Math.max(0, frame + from));
  const S = data.s[i] || [0, 0, 0, 0], K = data.c[i] || [0, 0, 0, 0];
  const cell = (k: number) => (
    <div key={k} style={{ width: 160, padding: "12px 0 10px", textAlign: "center", border: `2px solid ${tireColour(0.65 * S[k] + 0.35 * K[k], data.best)}`,
      boxShadow: `0 0 4px ${tireColour(0.65 * S[k] + 0.35 * K[k], data.best)}` }}>
      <div style={{ fontFamily: F.num, fontWeight: 500, fontSize: 56, lineHeight: 1, color: C.hot, ...glow(), fontVariantNumeric: "tabular-nums" }}>{Math.round(S[k])}°</div>
      <div style={{ fontFamily: F.num, fontWeight: 500, fontSize: 32, lineHeight: 1.25, color: C.redDim, ...glow(), fontVariantNumeric: "tabular-nums" }}>{Math.round(K[k])}°</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ padding: "150px 0 0 80px" }}>
      <div style={{ display: "inline-flex", flexDirection: "column", gap: 16, padding: "22px 24px", background: C.plate, alignSelf: "flex-start" }}>
        <div style={{ fontFamily: F.ui, fontWeight: 500, fontSize: 28, color: C.red, ...glow(true), letterSpacing: ".34em" }}>TIRES</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 160px", gap: 14 }}>{[0, 1, 2, 3].map(cell)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.ui, fontWeight: 500, fontSize: 26, color: C.redDim, ...glow(), gap: 24 }}>
          <span>SURFACE / CORE</span><span>BEST {data.best}°</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// End card: the wordmark (as on the boot screen) and the call to action. Fades in one way, nothing slides.
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const shade = interpolate(frame, [0, 0.4 * fps], [0, 0.82], { extrapolateRight: "clamp" });
  const mark = interpolate(frame, [0.25 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cta = interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: C.ink, opacity: shade }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 70 }}>
        <div style={{ opacity: mark, textAlign: "center", width: 860 }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 150, lineHeight: 0.84, textTransform: "uppercase", letterSpacing: "-0.02em",
            background: `linear-gradient(180deg, ${C.hotTop} 0%, ${C.hot} 45%, ${C.hotDeep} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text",
            WebkitTextFillColor: "transparent", filter: `blur(.6px) drop-shadow(0 0 3px ${C.hot})`, paddingTop: ".04em" }}>San<br />Velocita</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 22 }}>
            <span style={{ fontFamily: F.ui, fontWeight: 500, fontSize: 34, color: C.red, ...glow(true), letterSpacing: ".34em", whiteSpace: "nowrap" }}>GRAND PRIX</span>
            <i style={{ flex: 1, height: 2, background: C.red, boxShadow: `0 0 2px ${C.red}, 0 0 4px ${C.red}` }} />
            <i style={{ width: 150, height: 24, background: C.signal, transform: "skewX(-20deg)", filter: "blur(.6px) drop-shadow(0 0 2px #6a72ff)",
              WebkitMaskImage: "repeating-linear-gradient(90deg, #000 0 6.7px, transparent 6.7px 10.7px)" }} />
          </div>
        </div>
        <div style={{ opacity: cta, fontFamily: F.ui, fontWeight: 500, fontSize: 56, color: C.red, ...glow(true), letterSpacing: "-0.02em" }}>WISHLIST ON STEAM</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
