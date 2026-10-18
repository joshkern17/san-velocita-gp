// The narrated feature explainer (the approved template, BRAND §8), driven by a spec instead of hand-placed
// Sequences: shots back to back, each carrying narration lines cut from one take (seconds in the take), a caption per
// line (one amber word), an optional live readout from the director's per-frame log, the game's engines under the
// voice (~7 LU down) and up in the gaps marked for it, the end card, and the game's own music very low.
// Specs live in src/specs/*.json (one per video). Same look as TireTempsV2 (brand.tsx).
import { Audio, Video } from "@remotion/media";
import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Caption, EndCard, F, glow, useBrandFonts } from "./brand";

export type Line = { a: number; b: number; at?: number; text: string; amber?: string; src?: string };
export type Readout = { kind: "rpm" | "wake" | "drag"; key: string };
export type Shot = {
  name?: string; v: string; from?: number; dur: number; lines?: Line[]; anim?: boolean; readout?: Readout;
  eng?: number | [number, number][]; // engine volume, or keyframes [seconds into the shot, volume]
  rate?: number;
};
export type Spec = { dir: string; narration: string; music?: string; musicVol?: number; shots: Shot[]; data?: Record<string, Record<string, number[]>> };

const ENGINE = 0.32, FPS = 60;
// (the last shot runs on under the 3 s end card, so its duration includes it)
export const specFrames = (s: Spec) => Math.round(s.shots.reduce((n, x) => n + x.dur, 0) * FPS);

// a small live number panel, top left (same slot and plate as the tire readout)
const Panel: React.FC<{ title: string; rows: [string, string, string?][] }> = ({ title, rows }) => (
  <AbsoluteFill style={{ padding: "150px 0 0 80px" }}>
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 12, padding: "22px 28px", background: C.plate, alignSelf: "flex-start", minWidth: 330 }}>
      <div style={{ fontFamily: F.ui, fontWeight: 500, fontSize: 28, color: C.red, ...glow(true), letterSpacing: ".34em" }}>{title}</div>
      {rows.map(([k, v, col], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 28 }}>
          <span style={{ fontFamily: F.ui, fontWeight: 500, fontSize: 26, color: C.redDim, ...glow(), letterSpacing: ".18em" }}>{k}</span>
          <span style={{ fontFamily: F.num, fontWeight: 500, fontSize: 64, lineHeight: 1, color: col || C.hot, ...glow(), fontVariantNumeric: "tabular-nums" }}>{v}</span>
        </div>
      ))}
    </div>
  </AbsoluteFill>
);

const LiveReadout: React.FC<{ r: Readout; data: Record<string, number[]>; from: number }> = ({ r, data, from }) => {
  const f = useCurrentFrame();
  const at = (k: string) => { const a = data[k] || []; return a[Math.min(a.length - 1, Math.max(0, f + from))] ?? 0; };
  if (r.kind === "rpm") return <Panel title="ENGINE" rows={[["RPM", Math.round(at("rpm") / 10) * 10 + ""]]} />;
  if (r.kind === "drag") return <Panel title="SLIPSTREAM" rows={[["DRAG", "−" + Math.round(at("tow") * 100) + "%", C.blue]]} />;
  // wake: downforce lost per axle, in the game's condition colors (green → amber → pink)
  const fr = at("front"), rr = at("rear");
  const col = (x: number) => (x < 0.08 ? "#7be07b" : x < 0.2 ? C.amber : "#ff3d8a");
  return <Panel title="DOWNFORCE" rows={[["FRONT", "−" + Math.round(fr * 100) + "%", col(fr)], ["REAR", "−" + Math.round(rr * 100) + "%", col(rr)]]} />;
};

export const Explainer: React.FC<{ spec: Spec }> = ({ spec }) => {
  useBrandFonts();
  const { fps, durationInFrames } = useVideoConfig();
  let t = 0;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {spec.shots.map((s, k) => {
        const at = Math.round(t * fps), len = Math.round(s.dur * fps); t += s.dur;
        const eng = s.eng ?? ENGINE;
        const vol = typeof eng === "number" ? eng : (f: number) => interpolate(f / fps, eng.map((e) => e[0]), eng.map((e) => e[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const lines = s.lines || [];
        return (
          <Sequence key={k} name={s.name || s.v} from={at} durationInFrames={len}>
            <Video src={staticFile(`${spec.dir}/${s.v}`)} trimBefore={Math.round((s.from || 0) * fps)} muted={!!s.anim} volume={s.anim ? 0 : vol}
              playbackRate={s.rate || 1} style={{ width: "100%", height: "100%" }} />
            {s.readout && spec.data && <LiveReadout r={s.readout} data={spec.data[s.readout.key]} from={Math.round((s.from || 0) * fps)} />}
            {lines.map((l, i) => {
              const st = Math.round((l.at ?? 0.1) * fps);
              const next = lines[i + 1];
              // (the video's last line clears before the end card: it ends 0.5 s after the words do)
              const end = next ? Math.round((next.at ?? 0) * fps) : k === spec.shots.length - 1 ? Math.min(len, st + Math.round((l.b - l.a + 0.5) * fps)) : len;
              return (
                <Sequence key={i} name={"voice: " + l.text.slice(0, 26)} from={st} durationInFrames={Math.max(1, end - st)}>
                  <Audio src={staticFile(l.src || `${spec.dir}/${spec.narration}`)} trimBefore={Math.round(l.a * fps)} trimAfter={Math.round(l.b * fps)} />
                  <Caption text={l.text} amber={l.amber} />
                </Sequence>
              );
            })}
          </Sequence>
        );
      })}
      <Sequence name="End card" from={Math.round(t * fps) - 180} durationInFrames={180}><EndCard /></Sequence>
      {spec.music && <Audio name="Music" src={staticFile(spec.music)}
        volume={(f) => (spec.musicVol ?? 0.09) * interpolate(f, [0, fps, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />}
    </AbsoluteFill>
  );
};
