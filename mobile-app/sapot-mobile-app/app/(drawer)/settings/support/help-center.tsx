import { APP_ROUTES } from "@/config/routes";
import { ArticleList, resetTourCompletion, useTour } from "@/features/help";
import { uiLog } from "@/features/shared/core/utils/logger";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useTheme } from "react-native-paper";

export default function HelpCenter() {
  const theme = useTheme();
  const router = useRouter();
  const { start } = useTour();

  useEffect(() => {
    uiLog.info("[HelpCenter] mounted");
    return () => {
      uiLog.info("[HelpCenter] unmounted");
    };
  }, []);

  const handleReplayTour = async () => {
    uiLog.info("[HelpCenter] tour replay requested");
    await resetTourCompletion();
    await start();
    router.push(APP_ROUTES.HOME);
  };

  return <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}><ArticleList onReplayTour={handleReplayTour} /></View>;
}
