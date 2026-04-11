import { useAuth } from "@/features/auth";
import { navLog } from "@/features/shared/utils/logger";
import { Redirect, router } from "expo-router";
import React, { useEffect } from "react";
import { Image, useColorScheme, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { APP_ROUTES, AUTH_ROUTES } from "./routes";

const Index = () => {
  const theme = useTheme();
  const isDark = useColorScheme() === "dark";
  const { isAuthenticated, isGuest } = useAuth();

  useEffect(() => {
    navLog.info("[Index] mounted");
    return () => {
      navLog.info("[Index] unmounted");
    };
  }, []);

  useEffect(() => {
    navLog.debug("[Index] useEffect triggered, deps:", {
      isAuthenticated,
      isGuest,
    });
  }, [isAuthenticated, isGuest]);

  if (isAuthenticated || isGuest) {
    navLog.info("[Navigation] Navigating to Home", {
      screen: APP_ROUTES.HOME,
      isAuthenticated,
      isGuest,
    });
    return <Redirect href={APP_ROUTES.HOME} />;
  }

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
            style={{ fontWeight: "bold", color: theme.colors.inverseOnSurface }}
          >
            SAPOT
          </Text>
        </View>
      </View>
      <Text
        variant="headlineSmall"
        style={{
          textAlign: "center",
          fontWeight: "bold",
          marginBottom: 10,
          color: theme.colors.inverseOnSurface,
        }}
      >
        Reliable local and internet messaging
      </Text>

      {/* TODO: animation when pressed */}
      <Button
        icon="arrow-right"
        mode="contained"
        contentStyle={{ flexDirection: "row-reverse" }}
        onPress={() => {
          navLog.debug("[Index] onPress triggered");
          navLog.info("[Navigation] Navigating to GettingStarted", {
            screen: AUTH_ROUTES.GETTING_STARTED,
          });
          router.push(AUTH_ROUTES.GETTING_STARTED);
        }}
      >
        Get Started
      </Button>
    </View>
  );
};

export default Index;
