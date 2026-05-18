import { createRegisterFormState, createRegisterFormStateErrors } from "@/test/factories/auth-form-state.factory";
import {
  createRegisterCallbacks,
} from "@/test/mocks/auth-component.mock-builders";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import renderer from "react-test-renderer";
import { RegisterFormState, RegisterFormStateErrors } from "../../types";
import { RegisterStep1 } from "../register-step-1";

type MockPrimaryButtonProps = {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const mockPrimaryButton = jest.fn<
  React.ReactElement,
  [MockPrimaryButtonProps]
>();

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
  const { Text, Pressable } = require("react-native");

  return {
    Checkbox: ({ status, onPress }: { status: string; onPress: () => void }) => (
      <Pressable onPress={onPress} accessibilityState={{ checked: status === "checked" }} />
    ),
    HelperText: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Text: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    useTheme: () => ({
      colors: { primary: "#000", inverseOnSurface: "#fff" },
    }),
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

describe("RegisterStep1", () => {
  const defaultValues: RegisterFormState = createRegisterFormState();
  const defaultErrors: RegisterFormStateErrors = createRegisterFormStateErrors();

  const createProps = () => ({
    values: { ...defaultValues },
    errors: { ...defaultErrors },
    loading: false,
    ...createRegisterCallbacks(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Unit tests", () => {
    it("renders all fields, action button, and login link", () => {
      const props = createProps();
      const { getByLabelText, getByText } = render(
        <RegisterStep1 {...props} />
      );

      expect(getByLabelText("First Name")).toBeTruthy();
      expect(getByLabelText("Last Name")).toBeTruthy();
      expect(getByLabelText("Username")).toBeTruthy();
      expect(getByLabelText("Password")).toBeTruthy();
      expect(getByLabelText("Confirm Password")).toBeTruthy();
      expect(getByText("Create Account")).toBeTruthy();
      expect(getByText("Login here")).toBeTruthy();
    });

    it("emits onChange with the right field keys", () => {
      const props = createProps();
      const { getByLabelText } = render(<RegisterStep1 {...props} />);

      fireEvent.changeText(getByLabelText("First Name"), "Ada");
      fireEvent.changeText(getByLabelText("Username"), "ada-user");

      expect(props.onChange).toHaveBeenNthCalledWith(1, "firstName", "Ada");
      expect(props.onChange).toHaveBeenNthCalledWith(2, "username", "ada-user");
    });

    it("shows validation helper text for supplied errors", () => {
      const props = createProps();
      props.errors = {
        firstName: "First name is required",
        password: "Password is required",
      };

      const { getByText } = render(<RegisterStep1 {...props} />);

      expect(getByText("First name is required")).toBeTruthy();
      expect(getByText("Password is required")).toBeTruthy();
    });

    it("submits current values when create account is pressed", () => {
      const props = createProps();
      const { getByText } = render(<RegisterStep1 {...props} />);

      fireEvent.press(getByText("Create Account"));

      expect(props.onSubmit).toHaveBeenCalledWith(props.values);
    });

    it("passes disabled state to the primary action while loading", () => {
      const props = createProps();
      props.loading = true;

      render(<RegisterStep1 {...props} />);

      expect(mockPrimaryButton).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
          loading: true,
        })
      );
    });
  });

  describe("Integration tests", () => {
    type MockNavigation = {
      navigate: jest.MockedFunction<
        (screen: string, params?: Partial<RegisterFormState>) => void
      >;
    };

    const ParentHarness = ({ navigation }: { navigation: MockNavigation }) => {
      const [values, setValues] = React.useState<RegisterFormState>({
        ...defaultValues,
      });

      return (
        <RegisterStep1
          values={values}
          errors={{}}
          loading={false}
          onChange={(name, value) =>
            setValues((previous) => ({ ...previous, [name]: value }))
          }
          onSubmit={(payload) => navigation.navigate("RegisterSubmit", payload)}
        />
      );
    };

    it("updates parent state and submits merged values", () => {
      const navigation: MockNavigation = {
        navigate: jest.fn(),
      };

      const { getByLabelText, getByText } = render(
        <ParentHarness navigation={navigation} />
      );

      fireEvent.changeText(getByLabelText("First Name"), "Pat");
      fireEvent.changeText(getByLabelText("Username"), "pat-user");
      fireEvent.press(getByText("Create Account"));

      expect(navigation.navigate).toHaveBeenCalledWith(
        "RegisterSubmit",
        expect.objectContaining({
          firstName: "Pat",
          username: "pat-user",
        })
      );
    });
  });

  describe("Snapshot tests", () => {
    it("matches snapshot for default render", () => {
      const props = createProps();
      const tree = renderer.create(<RegisterStep1 {...props} />).toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
