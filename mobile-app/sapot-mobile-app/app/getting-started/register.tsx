import { View, StyleSheet } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import {
  Button,
  Checkbox,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Link, router } from "expo-router";

const Register = () => {
  const theme = useTheme();
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Register Account" />
      <ScreenContent
        title="Welcome to SAPOT"
        description="Create an account to get started"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          {/* TODO: create a error mechanism */}
          <TextInput
            mode="outlined"
            label="Username"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={styles.textInput}
          />
          {/* TODO: create a error mechanism */}
          <TextInput
            mode="outlined"
            label="Phone Number"
            placeholder="Phone Number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            style={styles.textInput}
          />
          {/* TODO: create a error mechanism */}
          <TextInput
            mode="outlined"
            label="Email Address"
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            style={styles.textInput}
          />
          {/* TODO: create a error mechanism */}
          <TextInput
            mode="outlined"
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            style={styles.textInput}
          />
          <TextInput
            mode="outlined"
            label="Confirm Password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.textInput}
          />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Checkbox
              status={termsChecked ? "checked" : "unchecked"}
              onPress={() => {
                setTermsChecked(!termsChecked);
              }}
            />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              I agree to{" "}
              {/* TODO: Make this a link where it will show the terms and condition texts */}
              <Text
                variant="bodyMedium"
                style={{ fontWeight: "bold", textDecorationLine: "underline" }}
              >
                Terms & Conditions
              </Text>
            </Text>
          </View>
        </View>
        <Button
          onPress={() => router.push("/(tabs)")}
          mode="contained"
          style={{ width: 280, marginBottom: 8 }}
        >
          Create Account
        </Button>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onPrimaryContainer }}
        >
          Already have an account?{" "}
          <Link
            href="/getting-started/server-login"
            style={{ fontWeight: "bold", textDecorationLine: "underline" }}
          >
            Login Here
          </Link>
        </Text>
      </ScreenContent>
    </View>
  );
};

const styles = StyleSheet.create({
  textInput: {
    marginBottom: 12,
  },
});

export default Register;
