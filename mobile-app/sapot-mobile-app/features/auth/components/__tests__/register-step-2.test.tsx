import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import renderer from "react-test-renderer";
import { RegisterFormState, RegisterFormStateErrors } from "../../types";
import { RegisterStep2 } from "../register-step-2";

type MockButtonProps = {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const mockPrimaryButton = jest.fn<React.ReactElement, [MockButtonProps]>();
const mockSecondaryButton = jest.fn<React.ReactElement, [MockButtonProps]>();

jest.mock("expo-router", () => {
  const { Pressable, Text } = require("react-native");

  return {
    Link: ({ children }: { href: string; children: React.ReactNode }) => (
      <Pressable>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

jest.mock("react-native-paper", () => {
  const { Pressable, Text } = require("react-native");

  return {
    Checkbox: ({
      status,
      onPress,
    }: {
      status: "checked" | "unchecked";
      onPress: () => void;
    }) => (
      <Pressable
        onPress={onPress}
        testID="terms-checkbox"
        accessibilityLabel={`terms-${status}`}
      >
        <Text>{status}</Text>
      </Pressable>
    ),
    HelperText: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Text: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    useTheme: () => ({
      colors: { inverseOnSurface: "#fff" },
    }),
  };
});

jest.mock("react-native-paper-dropdown", () => {
  const { Pressable, Text } = require("react-native");

  return {
    Dropdown: ({
      options,
      onSelect,
      value,
    }: {
      options: Array<{ label: string; value: string }>;
      onSelect: (value: string) => void;
      value?: string;
    }) => (
      <Pressable
        testID="security-question-dropdown"
        onPress={() => onSelect(options[0].value)}
      >
        <Text>{value || "Select question"}</Text>
      </Pressable>
    ),
  };
});

jest.mock("../auth-text-input", () => {
  const { TextInput } = require("react-native");

  return ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
  }) => (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
    />
  );
});

jest.mock("../primary-button", () => {
  const { Pressable, Text } = require("react-native");

  return (props: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => {
    const { children, onPress, disabled } = props;
    mockPrimaryButton(props);
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text>{children}</Text>
      </Pressable>
    );
  };
});

jest.mock("../secondary-button", () => {
  const { Pressable, Text } = require("react-native");

  return (props: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => {
    const { children, onPress, disabled } = props;
    mockSecondaryButton(props);
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text>{children}</Text>
      </Pressable>
    );
  };
});

describe("RegisterStep2", () => {
  const defaultValues: RegisterFormState = {
    username: "sam-user",
    firstName: "Sam",
    lastName: "Taylor",
    phoneNumber: "0900000000",
    email: "sam@example.com",
    password: "",
    securityQuestion: "",
    questionAnswer: "",
    confirmPassword: "",
    termsChecked: false,
  };

  const defaultErrors: RegisterFormStateErrors = {};

  const createProps = () => ({
    values: { ...defaultValues },
    errors: { ...defaultErrors },
    loading: false,
    onChange: jest.fn<void, [keyof RegisterFormState, string | boolean]>(),
    onSubmit: jest.fn<void, [Partial<RegisterFormState>]>(),
    onBack: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Unit tests", () => {
    it("renders all step-2 controls", () => {
      const props = createProps();
      const { getByLabelText, getByText, getByTestId } = render(
        <RegisterStep2 {...props} />
      );

      expect(getByTestId("security-question-dropdown")).toBeTruthy();
      expect(getByLabelText("Answer")).toBeTruthy();
      expect(getByLabelText("Password")).toBeTruthy();
      expect(getByLabelText("Confirm Password")).toBeTruthy();
      expect(getByText("Create Account")).toBeTruthy();
      expect(getByText("Back")).toBeTruthy();
    });

    it("emits onChange for text fields and dropdown selection", () => {
      const props = createProps();
      const { getByLabelText, getByTestId } = render(
        <RegisterStep2 {...props} />
      );

      fireEvent.press(getByTestId("security-question-dropdown"));
      fireEvent.changeText(getByLabelText("Answer"), "My answer");
      fireEvent.changeText(getByLabelText("Password"), "Secret123!");

      expect(props.onChange).toHaveBeenCalledWith(
        "securityQuestion",
        "What's something your parents don't know?"
      );
      expect(props.onChange).toHaveBeenCalledWith(
        "questionAnswer",
        "My answer"
      );
      expect(props.onChange).toHaveBeenCalledWith("password", "Secret123!");
    });

    it("toggles terms agreement state when checkbox is pressed", () => {
      const props = createProps();
      const { getByTestId } = render(<RegisterStep2 {...props} />);

      fireEvent.press(getByTestId("terms-checkbox"));

      // Verifies checkbox event emits the inverted boolean value.
      expect(props.onChange).toHaveBeenCalledWith("termsChecked", true);
    });

    it("shows helper text for validation errors", () => {
      const props = createProps();
      props.errors = {
        securityQuestion: "Select a security question",
        confirmPassword: "Passwords do not match",
      };

      const { getByText } = render(<RegisterStep2 {...props} />);

      expect(getByText("Select a security question")).toBeTruthy();
      expect(getByText("Passwords do not match")).toBeTruthy();
    });

    it("submits the current values when create account is pressed", () => {
      const props = createProps();
      const { getByText } = render(<RegisterStep2 {...props} />);

      fireEvent.press(getByText("Create Account"));

      expect(props.onSubmit).toHaveBeenCalledWith(props.values);
    });

    it("disables actions while loading", () => {
      const props = createProps();
      props.loading = true;

      render(<RegisterStep2 {...props} />);

      // Edge case: loading should lock both actions.
      expect(mockPrimaryButton).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
          loading: true,
        })
      );
      expect(mockSecondaryButton).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
        })
      );
    });
  });

  describe("Integration tests", () => {
    type MockNavigation = {
      navigate: jest.MockedFunction<
        (screen: string, params?: Partial<RegisterFormState>) => void
      >;
      goBack: jest.MockedFunction<() => void>;
    };

    const ParentHarness = ({ navigation }: { navigation: MockNavigation }) => {
      const [values, setValues] = React.useState<RegisterFormState>({
        ...defaultValues,
      });

      return (
        <RegisterStep2
          values={values}
          errors={{}}
          loading={false}
          onChange={(name, value) =>
            setValues((previous) => ({ ...previous, [name]: value }))
          }
          onSubmit={(payload) =>
            navigation.navigate("RegisterComplete", payload)
          }
          onBack={() => navigation.goBack()}
        />
      );
    };

    it("updates parent state and submits populated registration payload", () => {
      const navigation: MockNavigation = {
        navigate: jest.fn<
          void,
          [string, (Partial<RegisterFormState> | undefined)?]
        >(),
        goBack: jest.fn<void, []>(),
      };

      const { getByLabelText, getByText, getByTestId } = render(
        <ParentHarness navigation={navigation} />
      );

      fireEvent.press(getByTestId("security-question-dropdown"));
      fireEvent.changeText(getByLabelText("Answer"), "I overcame stage fright");
      fireEvent.changeText(getByLabelText("Password"), "Secret123!");
      fireEvent.changeText(getByLabelText("Confirm Password"), "Secret123!");
      fireEvent.press(getByTestId("terms-checkbox"));
      fireEvent.press(getByText("Create Account"));

      expect(navigation.navigate).toHaveBeenCalledWith(
        "RegisterComplete",
        expect.objectContaining({
          securityQuestion: "What's something your parents don't know?",
          questionAnswer: "I overcame stage fright",
          password: "Secret123!",
          confirmPassword: "Secret123!",
          termsChecked: true,
        })
      );
    });

    it("routes back to previous screen when Back is pressed", () => {
      const navigation: MockNavigation = {
        navigate: jest.fn<
          void,
          [string, (Partial<RegisterFormState> | undefined)?]
        >(),
        goBack: jest.fn<void, []>(),
      };

      const { getByText } = render(<ParentHarness navigation={navigation} />);
      fireEvent.press(getByText("Back"));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  describe("Snapshot tests", () => {
    it("matches snapshot for default render", () => {
      const props = createProps();
      const tree = renderer.create(<RegisterStep2 {...props} />).toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
