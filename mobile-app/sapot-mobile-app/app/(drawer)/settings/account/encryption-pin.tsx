import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { Button, Divider, Text, useTheme } from "react-native-paper";
import { PageLoader } from "@/features/shared/components/page-loader";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { useAuth } from "@/features/auth/context/auth-context";

function PinInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string[];
  onChange: (digits: string[]) => void;
  error?: boolean;
}) {
  const theme = useTheme();
  const refs = useRef<(RNTextInput | null)[]>([]);

  const handleDigit = (v: string, i: number) => {
    const digit = v.replace(/[^0-9]/g, "").slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (key: string, i: number) => {
    if (key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <View style={styles.fieldGroup}>
      <Text variant="labelMedium" style={{ marginBottom: 8 }}>{label}</Text>
      <View style={styles.row}>
        {value.map((d, i) => (
          <RNTextInput
            key={i}
            ref={(r) => { refs.current[i] = r; }}
            style={[
              styles.box,
              {
                borderColor: error ? theme.colors.error : theme.colors.outline,
                color: theme.colors.onBackground,
                backgroundColor: theme.colors.surface,
              },
            ]}
            value={d}
            onChangeText={(v) => handleDigit(v, i)}
            onKeyPress={({ nativeEvent }) => handleKey(nativeEvent.key, i)}
            keyboardType="number-pad"
            maxLength={1}
            secureTextEntry
            selectTextOnFocus
            textAlign="center"
          />
        ))}
      </View>
    </View>
  );
}

function blank(): string[] {
  return ["", "", "", "", "", ""];
}

export default function EncryptionPinScreen() {
  const theme = useTheme();
  const { localEncryptionService } = useMainContainer();
  useAuth(); // ensure auth context is loaded

  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Enable form
  const [newPin, setNewPin] = useState(blank());
  const [confirmPin, setConfirmPin] = useState(blank());
  const [password, setPassword] = useState("");

  // Change form
  const [oldPin, setOldPin] = useState(blank());
  const [changeNewPin, setChangeNewPin] = useState(blank());
  const [changePassword, setChangePassword] = useState("");

  // Disable form
  const [disablePin, setDisablePin] = useState(blank());
  const [disablePassword, setDisablePassword] = useState("");

  useEffect(() => {
    localEncryptionService.isPINEnabled().then(setPinEnabled);
  }, [localEncryptionService]);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleEnable = async () => {
    const p = newPin.join("");
    const c = confirmPin.join("");
    if (p.length < 6 || c.length < 6) return showStatus("Fill in all 6 digits.", false);
    if (p !== c) return showStatus("PINs do not match.", false);
    if (!password) return showStatus("Enter your current password.", false);

    setLoading(true);
    try {
      await localEncryptionService.setupPIN(password, p);
      setPinEnabled(true);
      setNewPin(blank());
      setConfirmPin(blank());
      setPassword("");
      showStatus("Encryption PIN enabled.", true);
    } catch {
      showStatus("Failed to enable PIN. Check your password.", false);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async () => {
    const old = oldPin.join("");
    const next = changeNewPin.join("");
    if (old.length < 6 || next.length < 6) return showStatus("Fill in all 6 digits.", false);
    if (!changePassword) return showStatus("Enter your current password.", false);

    setLoading(true);
    try {
      const ok = await localEncryptionService.changePIN(changePassword, old, next);
      if (ok) {
        setOldPin(blank());
        setChangeNewPin(blank());
        setChangePassword("");
        showStatus("PIN changed successfully.", true);
      } else {
        showStatus("Incorrect current PIN.", false);
      }
    } catch {
      showStatus("Failed to change PIN.", false);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    const p = disablePin.join("");
    if (p.length < 6) return showStatus("Fill in all 6 digits.", false);
    if (!disablePassword) return showStatus("Enter your current password.", false);

    setLoading(true);
    try {
      const ok = await localEncryptionService.removePIN(disablePassword, p);
      if (ok) {
        setPinEnabled(false);
        setDisablePin(blank());
        setDisablePassword("");
        showStatus("Encryption PIN removed.", true);
      } else {
        showStatus("Incorrect PIN or password.", false);
      }
    } catch {
      showStatus("Failed to remove PIN.", false);
    } finally {
      setLoading(false);
    }
  };

  if (pinEnabled === null) {
    return <PageLoader />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.secondary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontWeight: "semibold", marginBottom: 4 }}>Encryption PIN</Text>
      <Text variant="bodySmall" style={{ opacity: 0.7, marginBottom: 16 }}>
        An optional 6-digit PIN that acts as a second factor for your encryption keys.
        When enabled, you must enter it each time the app starts.
      </Text>

      {statusMsg && (
        <View
          style={[
            styles.status,
            {
              backgroundColor: statusMsg.ok
                ? theme.colors.primaryContainer
                : theme.colors.errorContainer,
            },
          ]}
        >
          <Text
            style={{
              color: statusMsg.ok
                ? theme.colors.onPrimaryContainer
                : theme.colors.onErrorContainer,
            }}
          >
            {statusMsg.text}
          </Text>
        </View>
      )}

      {!pinEnabled ? (
        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text variant="titleSmall" style={{ marginBottom: 16 }}>
            Enable Encryption PIN
          </Text>
          <RNTextInput
            style={[styles.textInput, { borderColor: theme.colors.outline, color: theme.colors.onBackground, backgroundColor: theme.colors.surface }]}
            placeholder="Current password"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <PinInput label="New PIN" value={newPin} onChange={setNewPin} />
          <PinInput label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} />
          <Button
            mode="contained"
            onPress={handleEnable}
            loading={loading}
            disabled={loading}
            style={{ marginTop: 16 }}
          >
            Enable PIN
          </Button>
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
            <Text variant="titleSmall" style={{ marginBottom: 16 }}>
              Change PIN
            </Text>
            <RNTextInput
              style={[styles.textInput, { borderColor: theme.colors.outline, color: theme.colors.onBackground, backgroundColor: theme.colors.surface }]}
              placeholder="Current password"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              secureTextEntry
              value={changePassword}
              onChangeText={setChangePassword}
            />
            <PinInput label="Current PIN" value={oldPin} onChange={setOldPin} />
            <PinInput label="New PIN" value={changeNewPin} onChange={setChangeNewPin} />
            <Button
              mode="contained"
              onPress={handleChange}
              loading={loading}
              disabled={loading}
              style={{ marginTop: 16 }}
            >
              Change PIN
            </Button>
          </View>

          <Divider style={{ marginVertical: 20 }} />

          <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
            <Text variant="titleSmall" style={{ marginBottom: 4 }}>
              Disable PIN
            </Text>
            <Text variant="bodySmall" style={{ opacity: 0.7, marginBottom: 16 }}>
              Removes the PIN requirement. Your keys will only be protected by your password.
            </Text>
            <RNTextInput
              style={[styles.textInput, { borderColor: theme.colors.outline, color: theme.colors.onBackground, backgroundColor: theme.colors.surface }]}
              placeholder="Current password"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              secureTextEntry
              value={disablePassword}
              onChangeText={setDisablePassword}
            />
            <PinInput label="Current PIN" value={disablePin} onChange={setDisablePin} />
            <Button
              mode="outlined"
              onPress={handleDisable}
              loading={loading}
              disabled={loading}
              textColor={theme.colors.error}
              style={{ marginTop: 16, borderColor: theme.colors.error }}
            >
              Disable PIN
            </Button>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
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
  fieldGroup: {
    marginBottom: 16,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 14,
  },
  status: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
});
