import {
  createUserContainerValue,
  createUserContainerWrapper,
} from "@/test/mocks/auth-container-context.mock";
import { renderHook } from "@testing-library/react-native";
import { useAuthContainer } from "./use-auth-container";

jest.mock("../context", () => ({
  AuthContainerContext: require("../context/auth-container-context")
    .AuthContainerContext,
}));

describe("useAuthContainer", () => {
  it("returns container from context", () => {
    // Arrange
    const container = createUserContainerValue({
      userService: { getUser: jest.fn() },
    });
    const wrapper = createUserContainerWrapper(container);

    // Act
    const { result } = renderHook(() => useAuthContainer(), { wrapper });

    // Assert
    expect(result.current).toBe(container);
  });

  it("throws when context is not initialized", () => {
    // Arrange / Act / Assert
    expect(() => renderHook(() => useAuthContainer())).toThrow(
      "User Container not initialized"
    );
  });
});
