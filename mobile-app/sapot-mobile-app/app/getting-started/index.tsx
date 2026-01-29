import {
  ModeSelect,
  ScreenContent,
  ScreenHeader,
} from "@/features/getting-started";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

const ModeSelectScreen = () => {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<"server" | "lan" | null>(
    null
  );

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Getting Started" />
      <ScreenContent
        title="Mode Select"
        description="Choose how you want to tuse the application"
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            width: "100%",
            alignItems: "stretch",
            marginBottom: 40,
          }}
        >
          <ModeSelect
            mode="server"
            selected={selectedMode === "server"}
            onPress={() => setSelectedMode("server")}
          />
          <ModeSelect
            mode="lan"
            selected={selectedMode === "lan"}
            onPress={() => setSelectedMode("lan")}
          />
        </View>
        <Button
          mode="contained"
          onPress={() => {
            if (!selectedMode) return;
            if (selectedMode === "server") {
              router.push("/getting-started/server-login");
            }
            if (selectedMode === "lan") {
              router.push("/getting-started/lan-login");
            }
          }}
          style={{
            width: "100%",
            opacity: selectedMode ? 1 : 0.5,
          }}
        >
          Proceed
        </Button>
      </ScreenContent>
    </View>
  );
};

export default ModeSelectScreen;
