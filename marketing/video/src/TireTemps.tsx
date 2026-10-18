// Explainer 001: tire temperatures (marketing/queue/2026-10-18-tire-temps/script.md). Narrated feature explainer:
// one sentence per shot, each cut in the pause after its sentence. Footage: tools/director (shots-gt.json, shots-club.json).
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { Caption, EndCard, TireReadout, useBrandFonts } from "./brand";
import T from "./tire-temps-data.json";

const ENGINE = 0.32; // the game's engines under the voice (~7-8 LU below it), swelling back up under the end card
export const TIRE_TEMPS_FRAMES = 2216;

export const TireTemps: React.FC = () => {
  useBrandFonts();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#05060c" }}>
      <Sequence name="1: Every tire in San Velocita h" from={0} durationInFrames={223}>
        <Video src={staticFile("tire-temps/01-wheel-s1.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["01-wheel-s1"]} />
        <Sequence name="voice" durationInFrames={223}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={0} trimAfter={196} />
          <Caption text="Every tire in San Velocita has two temperatures." amber="two" />
        </Sequence>
      </Sequence>
      <Sequence name="2: The surface heats up in seco" from={223} durationInFrames={200}>
        <Video src={staticFile("tire-temps/02-trackside-s2.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["02-trackside-s2"]} />
        <Sequence name="voice" durationInFrames={200}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={196} trimAfter={369} />
          <Caption text="The surface heats up in seconds when you slide." amber="surface" />
        </Sequence>
      </Sequence>
      <Sequence name="3: The core warms slowly, lap a" from={423} durationInFrames={245}>
        <Video src={staticFile("tire-temps/03-heli-s3.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={245}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={369} trimAfter={587} />
          <Caption text="The core warms slowly, lap after lap." amber="core" />
        </Sequence>
      </Sequence>
      <Sequence name="4: Grip comes from both, and on" from={668} durationInFrames={257}>
        <Video src={staticFile("tire-temps/04-dolly-s4.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["04-dolly-s4"]} />
        <Sequence name="voice" durationInFrames={257}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={587} trimAfter={817} />
          <Caption text="Grip comes from both, and only inside a narrow window." amber="window" />
        </Sequence>
      </Sequence>
      <Sequence name="5: The fast cars leave the pits" from={925} durationInFrames={204}>
        <Video src={staticFile("tire-temps/05-wheel-s5a.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["05-wheel-s5a"]} />
        <Sequence name="voice" durationInFrames={204}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={817} trimAfter={994} />
          <Caption text="The fast cars leave the pits on tire warmers." amber="warmers" />
        </Sequence>
      </Sequence>
      <Sequence name="6: The club cars start cold, so" from={1129} durationInFrames={269}>
        <Video src={staticFile("tire-temps/01-dolly-s5b.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["01-dolly-s5b"]} />
        <Sequence name="voice" durationInFrames={269}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={994} trimAfter={1236} />
          <Caption text="The club cars start cold, so you earn your grip in the first lap." amber="cold" />
        </Sequence>
      </Sequence>
      <Sequence name="7: Push them too hot, and they " from={1398} durationInFrames={197}>
        <Video src={staticFile("tire-temps/06-trackside-s6.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={197}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={1236} trimAfter={1406} />
          <Caption text="Push them too hot, and they wear out faster." amber="hot" />
        </Sequence>
      </Sequence>
      <Sequence name="8: So we didn't give you a grip" from={1595} durationInFrames={170}>
        <Video src={staticFile("tire-temps/07-game-s7a.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={170}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={1406} trimAfter={1549} />
          <Caption text="So we didn't give you a grip slider." amber="slider" />
        </Sequence>
      </Sequence>
      <Sequence name="9: You warm the rubber yourself" from={1765} durationInFrames={149}>
        <Video src={staticFile("tire-temps/08-game-s7b.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={149}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={1549} trimAfter={1672} />
          <Caption text="You warm the rubber yourself." amber="yourself" />
        </Sequence>
      </Sequence>
      <Sequence name="10: How do you bring yours in?" from={1915} durationInFrames={301}>
        <Video src={staticFile("tire-temps/09-orbit-s8.mp4")} volume={(f) => interpolate(f, [121, 166], [ENGINE, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={121}>
          <Audio src={staticFile("tire-temps/narration.mp3")} trimBefore={1672} trimAfter={1757} />
          <Caption text="How do you bring yours in?" />
        </Sequence>
      </Sequence>
      <Sequence name="End card" from={2036} durationInFrames={180}>
        <EndCard />
      </Sequence>
      <Audio name="Music: Changing Light" src={staticFile("tire-temps/music.mp3")}
        volume={(f) => 0.09 * interpolate(f, [0, fps, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};
