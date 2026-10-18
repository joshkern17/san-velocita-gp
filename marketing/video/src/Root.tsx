import { Composition } from "remotion";
import { TireTemps } from "./TireTemps";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TireTemps" component={TireTemps} durationInFrames={2216} fps={60} width={1080} height={1920} />
    </>
  );
};
