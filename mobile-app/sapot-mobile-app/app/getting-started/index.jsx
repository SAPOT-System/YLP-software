import { Text, View } from "@/components/Themed";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet } from "react-native";

const ModeSelect = () => {
  const router = useRouter();
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
          <Text style={styles.headerText}>Getting Started</Text>
        </View>
      </View>
      <View
        style={{
          marginTop: -30,
          width: "100%",
          borderTopRightRadius: 50,
          flex: 1,
        }}
      >
        <Text>Mode select</Text>
        <Pressable onPress={() => router.push("/(tabs)")}>
          <Text>Continue</Text>
        </Pressable>
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
  headerText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
export default ModeSelect;
