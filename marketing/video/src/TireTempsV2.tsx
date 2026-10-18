// Explainer 001 v2: tire temperatures, with the animated slip-angle beat (marketing/queue/2026-10-18-tire-temps/
// script-v2.md). Script from the explainer-script skill; the beat is a HyperFrames render (marketing/anim/slip-beat).
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { Caption, EndCard, TireReadout, useBrandFonts } from "./brand";
import T from "./tire-temps-data.json";

const ENGINE = 0.32; // the game's engines ~7-8 LU under the voice, swelling back up under the end card

export const TireTempsV2: React.FC = () => {
  useBrandFonts();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#05060c" }}>
      <Sequence name="This Miata's tires are at 35 d" from={0} durationInFrames={288}>
        <Video src={staticFile("tire-temps/01-dolly-s5b.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["01-dolly-s5b"]} />
        <Sequence name="voice" durationInFrames={288}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={0} trimAfter={264} />
          <Caption text="This Miata's tires are at 35 degrees. They want 70." amber="70" />
        </Sequence>
      </Sequence>
      <Sequence name="Every tire here has two temper" from={288} durationInFrames={185}>
        <Video src={staticFile("tire-temps/01-wheel-s1.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["01-wheel-s1"]} />
        <Sequence name="voice" durationInFrames={185}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={264} trimAfter={425} />
          <Caption text="Every tire here has two temperatures." amber="two" />
        </Sequence>
      </Sequence>
      <Sequence name="ANIM: slip angle beat" from={473} durationInFrames={597}>
        <Video src={staticFile("tire-temps/slip-beat.mp4")} muted style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice: grips best" durationInFrames={305}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={425} trimAfter={706} />
          <Caption text="A tire grips best while it's slipping a little. About five or six degrees." amber="slipping" />
        </Sequence>
        <Sequence name="voice: past that" from={305} durationInFrames={292}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={706} trimAfter={974} />
          <Caption text="Past that, it starts to slide… and sliding makes heat." amber="heat" />
        </Sequence>
      </Sequence>
      <Sequence name="The surface spikes in seconds." from={1070} durationInFrames={162}>
        <Video src={staticFile("tire-temps/02-trackside-s2.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["02-trackside-s2"]} />
        <Sequence name="voice" durationInFrames={162}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={974} trimAfter={1112} />
          <Caption text="The surface spikes in seconds." amber="surface" />
        </Sequence>
      </Sequence>
      <Sequence name="The core, underneath, takes la" from={1232} durationInFrames={183}>
        <Video src={staticFile("tire-temps/03-heli-s3.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={183}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={1112} trimAfter={1271} />
          <Caption text="The core, underneath, takes laps." amber="core" />
        </Sequence>
      </Sequence>
      <Sequence name="The fast cars cheat a little. " from={1415} durationInFrames={247}>
        <Video src={staticFile("tire-temps/04-dolly-s4.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <TireReadout data={T["04-dolly-s4"]} />
        <Sequence name="voice" durationInFrames={247}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={1271} trimAfter={1494} />
          <Caption text="The fast cars cheat a little. They leave the pits on warmers." amber="warmers" />
        </Sequence>
      </Sequence>
      <Sequence name="We could've given you a grip s" from={1662} durationInFrames={143}>
        <Video src={staticFile("tire-temps/07-game-s7a.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={143}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={1494} trimAfter={1613} />
          <Caption text="We could've given you a grip slider." amber="slider" />
        </Sequence>
      </Sequence>
      <Sequence name="We'd rather you learn your tir" from={1805} durationInFrames={138}>
        <Video src={staticFile("tire-temps/08-game-s7b.mp4")} volume={ENGINE} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={138}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={1613} trimAfter={1727} />
          <Caption text="We'd rather you learn your tires." amber="learn" />
        </Sequence>
      </Sequence>
      <Sequence name="So… slow out lap, or send it?" from={1943} durationInFrames={395}>
        <Video src={staticFile("tire-temps/09-orbit-s8.mp4")} volume={(f) => interpolate(f, [215, 260], [ENGINE, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} style={{ width: "100%", height: "100%" }} />
        <Sequence name="voice" durationInFrames={215}>
          <Audio src={staticFile("tire-temps/narration-v2.mp3")} trimBefore={1727} trimAfter={1906} />
          <Caption text="So… slow out lap, or send it?" />
        </Sequence>
      </Sequence>
      <Sequence name="End card" from={2158} durationInFrames={180}>
        <EndCard />
      </Sequence>
      <Audio name="Music: Changing Light" src={staticFile("tire-temps/music.mp3")}
        volume={(f) => 0.09 * interpolate(f, [0, fps, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};
