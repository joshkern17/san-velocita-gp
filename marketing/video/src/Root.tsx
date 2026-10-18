import { Composition } from "remotion";
import { TireTemps } from "./TireTemps";
import { TireTempsV2 } from "./TireTempsV2";
import { Explainer, Spec, specFrames } from "./Explainer";
import aisees from "./specs/aisees.json";
import dirtyair from "./specs/dirtyair.json";
import engines from "./specs/engines.json";
import spa from "./specs/spa.json";
import { hookFrames, TireTempsHookB, TireTempsHookC } from "./TireTempsHooks";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TireTemps" component={TireTemps} durationInFrames={2216} fps={60} width={1080} height={1920} />
      <Composition id="TireTempsV2" component={TireTempsV2} durationInFrames={2338} fps={60} width={1080} height={1920} />
      <Composition id="TireTempsHookB" component={TireTempsHookB} durationInFrames={hookFrames("B")} fps={60} width={1080} height={1920} />
      <Composition id="TireTempsHookC" component={TireTempsHookC} durationInFrames={hookFrames("C")} fps={60} width={1080} height={1920} />
      <Composition id="Engines" component={Explainer} defaultProps={{ spec: engines as Spec }} durationInFrames={specFrames(engines as Spec)} fps={60} width={1080} height={1920} />
      <Composition id="SpaScan" component={Explainer} defaultProps={{ spec: spa as Spec }} durationInFrames={specFrames(spa as Spec)} fps={60} width={1080} height={1920} />
      <Composition id="DirtyAir" component={Explainer} defaultProps={{ spec: dirtyair as Spec }} durationInFrames={specFrames(dirtyair as Spec)} fps={60} width={1080} height={1920} />
      <Composition id="AiSees" component={Explainer} defaultProps={{ spec: aisees as Spec }} durationInFrames={specFrames(aisees as Spec)} fps={60} width={1080} height={1920} />
    </>
  );
};
