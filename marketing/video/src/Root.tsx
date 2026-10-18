import { Composition } from "remotion";
import { TireTemps } from "./TireTemps";
import { TireTempsV2 } from "./TireTempsV2";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TireTemps" component={TireTemps} durationInFrames={2216} fps={60} width={1080} height={1920} />
      <Composition id="TireTempsV2" component={TireTempsV2} durationInFrames={2338} fps={60} width={1080} height={1920} />
    </>
  );
};
