import LottieView from "lottie-react-native";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

export function LottieProgressBar() {
  const colorScheme = useColorScheme();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let value = 0;
    const interval = setInterval(() => {
      value += 0.1;
      setProgress(Math.min(value, 1));
      if (value >= 1) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const progressBarSource =
    colorScheme === "dark"
      ? require("../assets/animation/progress-bar-dark.json")
      : require("../assets/animation/progress-bar-light.json");

  return (
    <LottieView
      source={progressBarSource}
      progress={progress}
      style={{ width: 224, height: 12 }}
    />
  );
}
