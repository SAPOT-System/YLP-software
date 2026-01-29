import { router } from "expo-router";
import React from "react";
import { Button, Text, useTheme } from "react-native-paper";
import { View, Image, useColorScheme } from "react-native";

const Index = () => {
  const theme = useTheme();
  const isDark = useColorScheme() === "dark";

  return (
    <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
      <View
        style={{
          width: 265,
          height: 265,
          borderRadius: 150,
          borderWidth: 1,
          borderColor: isDark ? "#D9D9D9" : "#9BAFC8",
          backgroundColor: "transparent",
          justifyContent: "center",
          marginBottom: 24,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 215,
            height: 215,
            borderRadius: 110,
            borderWidth: 1,
            borderColor: isDark ? "#D9D9D9" : "#9BAFC8",
            backgroundColor: "transparent",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Image
            source={require("../assets/images/logo.png")}
            style={{ width: 100, height: 100, resizeMode: "contain" }}
          />
          <Text
            variant="titleLarge"
            style={{ fontWeight: "bold", color: theme.colors.primary }}
          >
            SAPOT
          </Text>
        </View>
      </View>
      <Text
        variant="headlineSmall"
        style={{ textAlign: "center", fontWeight: "bold", marginBottom: 10 }}
      >
        Reliable local and internet messaging
      </Text>

      {/* TODO: animation when pressed */}
      <Button
        icon="arrow-right"
        mode="contained"
        contentStyle={{ flexDirection: "row-reverse" }}
        onPress={() => router.push("/getting-started")}
      >
        Get Started
      </Button>
    </View>
  );
};

export default Index;
