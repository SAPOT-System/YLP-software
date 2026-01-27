import { Text, View } from "@/components/Themed";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, useColorScheme } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyledText } from "@/components/StyledText";
import { useTheme } from "@/components/useTheme";

const Index = () => {
  const router = useRouter();
  const [isGetStartedPressed, setIsGetStartedPressed] = useState(false);
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{ alignItems: "center", justifyContent: "center", flex: 1 }}
      variant="surface"
    >
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
          <StyledText size="xxl" weight="bold">
            SAPOT
          </StyledText>
        </View>
      </View>
      <StyledText
        size="xxl"
        weight="bold"
        style={{ textAlign: "center" }}
      >
        Reliable local and internet messaging
      </StyledText>

      {/* TODO: animation when pressed */}
      <LinearGradient
        colors={
          isGetStartedPressed
            ? isDark
              ? ["#696969", "#606060"]
              : ["#103462", "#E6E6E6"]
            : isDark
            ? ["#606060", "#696969"]
            : ["#E6E6E6", "#103462"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 30,
          marginTop: 32,
        }}
      >
        <Pressable
          onPress={() => router.push("/getting-started")}
          onPressIn={() => setIsGetStartedPressed(true)}
          onPressOut={() => setIsGetStartedPressed(false)}
          style={{
            paddingLeft: 34,
            paddingRight: 3,
            paddingVertical: 3,
            borderRadius: 30,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "medium",
                fontSize: 13,
              }}
            >
              Get Started
            </Text>
            {/* TODO: style this with inner shadow. Probably remove the inner shadow.*/}
            <View
              style={{
                backgroundColor: "white",
                height: 43,
                width: 43,
                borderRadius: 22,
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* TODO: change the icon to a lighter one. Probably use another library */}
              <FontAwesome name="arrow-right" size={24} />
            </View>
          </View>
        </Pressable>
      </LinearGradient>
    </View>
  );
};

export default Index;
