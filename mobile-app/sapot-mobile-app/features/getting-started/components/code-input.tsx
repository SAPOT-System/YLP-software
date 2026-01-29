import { View } from "react-native";
import React from "react";
import { TextInput } from "react-native-paper";

interface CodeInputProps {
  code: string[];
  refs: React.RefObject<(React.ComponentRef<typeof TextInput> | null)[]>;
  onChangeText: (text: string, index: number) => void;
  onKeyPress: (e: any, index: number) => void;
}

export const CodeInput = ({
  code,
  refs,
  onChangeText,
  onKeyPress,
}: CodeInputProps) => {
  return (
    <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
      {code.map((value, index) => (
        <TextInput
          key={index}
          ref={(ref: React.ComponentRef<typeof TextInput> | null) => {
            refs.current[index] = ref;
          }}
          value={value}
          onChangeText={(text) => onChangeText(text, index)}
          onKeyPress={(e) => onKeyPress(e, index)}
          keyboardType="number-pad"
          maxLength={1}
          mode="outlined"
          textAlign="center"
          style={{ width: 48, height: 56 }}
        />
      ))}
    </View>
  );
};
