import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { LoadingSpinner } from "./loading-spinner";

interface PageLoaderProps {
  skeleton?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const PageLoader = ({ skeleton, style }: PageLoaderProps) => (
  <View testID="page-loader-container" style={[styles.container, style]}>
    {skeleton ?? <LoadingSpinner size="large" />}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
