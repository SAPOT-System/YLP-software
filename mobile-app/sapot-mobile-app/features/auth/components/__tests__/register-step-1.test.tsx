import { createRegisterFormState, createRegisterFormStateErrors } from "@/test/factories/auth-form-state.factory";
import {
    createRegisterCallbacks,
    createRegisterNavigationMock,
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
  const { Text } = require("react-native");

  return {
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
      expect(getByLabelText("Phone Number")).toBeTruthy();
      expect(getByLabelText("Email Address")).toBeTruthy();
      expect(getByText("Continue")).toBeTruthy();
      expect(getByText("Login Here")).toBeTruthy();
    });

    it("emits onChange with the right field keys", () => {
      const props = createProps();
      const { getByLabelText } = render(<RegisterStep1 {...props} />);

      fireEvent.changeText(getByLabelText("First Name"), "Ada");
      fireEvent.changeText(getByLabelText("Email Address"), "ada@example.com");

      // Verifies isolated field mapping logic in each input callback.
      expect(props.onChange).toHaveBeenNthCalledWith(1, "firstName", "Ada");
      expect(props.onChange).toHaveBeenNthCalledWith(
        2,
        "email",
        "ada@example.com"
      );
    });

    it("shows validation helper text for supplied errors", () => {
      const props = createProps();
      props.errors = {
        firstName: "First name is required",
        email: "Email is invalid",
      };

      const { getByText } = render(<RegisterStep1 {...props} />);

      expect(getByText("First name is required")).toBeTruthy();
      expect(getByText("Email is invalid")).toBeTruthy();
    });

    it("submits current values when continue is pressed", () => {
      const props = createProps();
      const { getByText } = render(<RegisterStep1 {...props} />);

      fireEvent.press(getByText("Continue"));

      expect(props.onSubmit).toHaveBeenCalledWith(props.values);
    });

    it("passes disabled state to the primary action while loading", () => {
      const props = createProps();
      props.loading = true;

      render(<RegisterStep1 {...props} />);

      // Edge case: loading should produce a disabled submit button.
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
      goBack: jest.MockedFunction<() => void>;
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
          onSubmit={(payload) => navigation.navigate("RegisterStep2", payload)}
        />
      );
    };

    it("updates parent state and submits merged values to navigation", () => {
      const navigation: MockNavigation = createRegisterNavigationMock();

      const { getByLabelText, getByText } = render(
        <ParentHarness navigation={navigation} />
      );

      fireEvent.changeText(getByLabelText("First Name"), "Pat");
      fireEvent.changeText(getByLabelText("Username"), "pat-user");
      fireEvent.press(getByText("Continue"));

      expect(navigation.navigate).toHaveBeenCalledWith(
        "RegisterStep2",
        expect.objectContaining({
          firstName: "Pat",
          username: "pat-user",
        })
      );
      expect(navigation.goBack).not.toHaveBeenCalled();
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
