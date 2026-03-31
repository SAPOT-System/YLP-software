import { View, Image, StyleSheet } from "react-native";
import { Text, useTheme } from "react-native-paper";
import React from "react";

interface ScreenHeaderProps {
  headerName: string;
}
export const ScreenHeader = ({ headerName }: ScreenHeaderProps) => {
  const theme = useTheme();
  return (
    <View
      style={{
        width: "100%",
        height: 230,
        alignItems: "center",
        backgroundColor: "transparent",
      }}
    >
      <Image
        source={require("../../../assets/images/getting-started-header.png")}
        style={styles.headerImage}
      />
      <View style={styles.textOverlay}>
        <Text
          variant="headlineMedium"
          style={{
            fontWeight: "bold",
            color: theme.colors.inverseOnSurface,
          }}
        >
          {headerName}
        </Text>
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
