import React, { useRef, useState } from "react";
import { StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";

interface Props {
  onSubmit: (pin: string) => Promise<boolean>;
}

export function PinEntryGate({ onSubmit }: Props) {
  const theme = useTheme();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(RNTextInput | null)[]>([]);

  const handleDigit = (value: string, index: number) => {
    const digit = value.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(false);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    const pin = digits.join("");
    if (pin.length < 6) return;
    setLoading(true);
    const ok = await onSubmit(pin);
    setLoading(false);
    if (!ok) {
      setError(true);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="headlineSmall" style={styles.heading}>
        Encryption PIN
      </Text>
      <Text variant="bodyMedium" style={styles.sub}>
        Enter your 6-digit encryption PIN to continue.
      </Text>

      <View style={styles.row}>
        {digits.map((d, i) => (
          <RNTextInput
            key={i}
            ref={(r) => { inputRefs.current[i] = r; }}
            style={[
              styles.box,
              {
                borderColor: error
                  ? theme.colors.error
                  : theme.colors.outline,
                color: theme.colors.onBackground,
                backgroundColor: theme.colors.surface,
              },
            ]}
            value={d}
            onChangeText={(v) => handleDigit(v, i)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
            keyboardType="number-pad"
            maxLength={1}
            secureTextEntry
            selectTextOnFocus
            textAlign="center"
          />
        ))}
      </View>

      {error && (
        <Text style={{ color: theme.colors.error, marginTop: 8 }}>
          Incorrect PIN. Try again.
        </Text>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={digits.join("").length < 6}
          style={styles.button}
        >
          Unlock
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  heading: {
    marginBottom: 8,
    fontWeight: "bold",
  },
  sub: {
    marginBottom: 32,
    textAlign: "center",
    opacity: 0.7,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  box: {
    width: 44,
    height: 56,
    borderWidth: 1.5,
    borderRadius: 8,
    fontSize: 20,
  },
  button: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
});
