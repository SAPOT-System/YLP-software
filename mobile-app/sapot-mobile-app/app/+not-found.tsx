import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { Text } from "react-native-paper";

export default function NotFoundScreen() {
  useEffect(() => {
    uiLog.info("[NotFoundScreen] mounted");
    return () => {
      uiLog.info("[NotFoundScreen] unmounted");
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: "#2e78b7",
  },
});
