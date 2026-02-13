import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { TextInput } from "react-native";
import { CodeInput } from "../code-input";

describe("CodeInput", () => {
  it("renders inputs and handles events", () => {
    const onChangeText = jest.fn();
    const onKeyPress = jest.fn();
    const refs = { current: [null, null, null, null] } as React.RefObject<
      (React.ComponentRef<typeof TextInput> | null)[]
    >;

    const { UNSAFE_getAllByType } = render(
      <CodeInput
        code={["", "", "", ""]}
        refs={refs}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
      />
    );

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(4);

    fireEvent.changeText(inputs[0], "1");
    expect(onChangeText).toHaveBeenCalledWith("1", 0);

    fireEvent(inputs[0], "keyPress", { nativeEvent: { key: "Backspace" } });
    expect(onKeyPress).toHaveBeenCalled();
  });
});
