import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";

export default function PublicChat() {
  const theme = useTheme();
  const [message, setMessage] = useState("");
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 20}
    >
      <View style={styles.body}>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No messages yet</Text>
        </View>
      </View>

      <View style={styles.composerContainer}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.dark ? "#1A233A" : "#C9C9C9",
              color: theme.dark ? "#FFF" : "#000",
            },
          ]}
          onChangeText={setMessage}
          value={message}
          placeholder="Message..."
          placeholderTextColor="#696969"
        />
        <IconButton icon="send" size={30} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  composerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    minHeight: 60,
    maxHeight: 120,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    color: "#758695",
    fontSize: 14,
  },
});
