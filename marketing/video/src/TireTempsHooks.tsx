// Explainer 001 v2, hook variants (marketing/queue/2026-10-18-tire-temps-hook-b, -hook-c). Same footage, beat and
// narration as TireTempsV2; one thing changes per variant (STRATEGY §4: re-cut, don't reshoot).
//   B: a new narrated first line ("Thirty-five degrees. That's how cold this Miata's tires are.")
//   C: the first two lines swapped: open on the wheel close-up, "Every tire here has two temperatures."
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { Caption, EndCard, TireReadout, useBrandFonts } from "./brand";
import T from "./tire-temps-data.json";

const ENGINE = 0.32;
type Line = { a: number; b: number; text: string; amber?: string; src?: string; at?: number };
type Seg = { name: string; dur: number; video: string; readout?: keyof typeof T; lines: Line[]; anim?: boolean; last?: boolean };
const NV = "tire-temps/narration-v2.mp3";

const MIATA: Seg = { name: "Miata 35/70", dur: 288, video: "01-dolly-s5b", readout: "01-dolly-s5b", lines: [{ a: 0, b: 264, text: "This Miata's tires are at 35 degrees. They want 70.", amber: "70" }] };
const TWO: Seg = { name: "two temperatures", dur: 185, video: "01-wheel-s1", readout: "01-wheel-s1", lines: [{ a: 264, b: 425, text: "Every tire here has two temperatures.", amber: "two" }] };
const REST: Seg[] = [
  { name: "ANIM slip beat", dur: 597, video: "slip-beat", anim: true, lines: [
    { a: 425, b: 706, text: "A tire grips best while it's slipping a little. About five or six degrees.", amber: "slipping" },
    { a: 706, b: 974, at: 305, text: "Past that, it starts to slide… and sliding makes heat.", amber: "heat" }] },
  { name: "surface", dur: 162, video: "02-trackside-s2", readout: "02-trackside-s2", lines: [{ a: 974, b: 1112, text: "The surface spikes in seconds.", amber: "surface" }] },
  { name: "core", dur: 183, video: "03-heli-s3", lines: [{ a: 1112, b: 1271, text: "The core, underneath, takes laps.", amber: "core" }] },
  { name: "warmers", dur: 247, video: "04-dolly-s4", readout: "04-dolly-s4", lines: [{ a: 1271, b: 1494, text: "The fast cars cheat a little. They leave the pits on warmers.", amber: "warmers" }] },
  { name: "slider", dur: 143, video: "07-game-s7a", lines: [{ a: 1494, b: 1613, text: "We could've given you a grip slider.", amber: "slider" }] },
  { name: "learn", dur: 138, video: "08-game-s7b", lines: [{ a: 1613, b: 1727, text: "We'd rather you learn your tires.", amber: "learn" }] },
  { name: "question", dur: 395, video: "09-orbit-s8", last: true, lines: [{ a: 1727, b: 1906, text: "So… slow out lap, or send it?" }] },
];

export const HOOKS = {
  B: [{ ...MIATA, name: "hook B: 35 degrees, how cold", dur: 270, lines: [{ a: 0, b: 262, src: "tire-temps/hook-b.mp3", text: "Thirty-five degrees. That's how cold this Miata's tires are.", amber: "cold" }] }, TWO, ...REST],
  C: [TWO, MIATA, ...REST],
};
export const hookFrames = (k: keyof typeof HOOKS) => HOOKS[k].reduce((n, s) => n + s.dur, 0) + 180;

const Cut: React.FC<{ segs: Seg[] }> = ({ segs }) => {
  useBrandFonts();
  const { fps, durationInFrames } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#05060c" }}>
      {segs.map((s) => {
        const at = from; from += s.dur;
        const vol = s.last ? (f: number) => interpolate(f, [215, 260], [ENGINE, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : ENGINE;
        return (
          <Sequence key={s.name} name={s.name} from={at} durationInFrames={s.dur}>
            {s.anim ? <Video src={staticFile("tire-temps/slip-beat.mp4")} muted style={{ width: "100%", height: "100%" }} />
              : <Video src={staticFile(`tire-temps/${s.video}.mp4`)} volume={vol} style={{ width: "100%", height: "100%" }} />}
            {s.readout && <TireReadout data={T[s.readout]} />}
            {s.lines.map((l, i) => {
              const st = l.at ?? 0, end = s.lines[i + 1]?.at ?? (s.last ? 215 : s.dur);
              return (
                <Sequence key={i} name={"voice: " + l.text.slice(0, 24)} from={st} durationInFrames={end - st}>
                  <Audio src={staticFile(l.src || NV)} trimBefore={l.a} trimAfter={l.b} />
                  <Caption text={l.text} amber={l.amber} />
                </Sequence>
              );
            })}
          </Sequence>
        );
      })}
      <Sequence name="End card" from={from} durationInFrames={180}><EndCard /></Sequence>
      <Audio name="Music: Changing Light" src={staticFile("tire-temps/music.mp3")}
        volume={(f) => 0.09 * interpolate(f, [0, fps, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};
export const TireTempsHookB: React.FC = () => <Cut segs={HOOKS.B} />;
export const TireTempsHookC: React.FC = () => <Cut segs={HOOKS.C} />;
