import { ModeSelect } from "@/features/getting-started";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

const ModeSelectScreen = () => {
  const router = useRouter();
  const theme = useTheme();
  const [selectedMode, setSelectedMode] = useState<"server" | "lan" | null>(
    null
  );

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <View
        style={{
          width: "100%",
          height: 230,
          alignItems: "center",
          backgroundColor: "transparent",
        }}
      >
        <Image
          source={require("../../assets/images/getting-started-header.png")}
          style={styles.headerImage}
        />
        <View style={styles.textOverlay}>
          <Text
            variant="headlineMedium"
            style={{
              fontWeight: "bold",
              color: theme.colors.onPrimaryContainer,
            }}
          >
            Getting Started
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: -30,
          width: "100%",
          borderTopRightRadius: 50,
          flex: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          backgroundColor: theme.colors.surface,
          paddingTop: 60,
          paddingHorizontal: 20,
        }}
      >
        <Text
          style={{ color: theme.colors.onPrimaryContainer, fontWeight: "bold" }}
          variant="titleLarge"
        >
          Mode select
        </Text>
        <Text
          style={{ textAlign: "center", color: theme.colors.outline }}
          variant="bodySmall"
        >
          Choose how you want to use the application
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginTop: 20,
            width: "100%",
            alignItems: "stretch",
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
            marginTop: 20,
            opacity: selectedMode ? 1 : 0.5,
          }}
        >
          Proceed
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    position: "relative",
  },
  textOverlay: {
    backgroundColor: "transparent",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
export default ModeSelectScreen;
