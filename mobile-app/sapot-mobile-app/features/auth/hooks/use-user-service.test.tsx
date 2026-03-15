import {
  createUserContainerValue,
  createUserContainerWrapper,
} from "@/test/mocks/auth-container-context.mock";
import { renderHook } from "@testing-library/react-native";
import { useUserService } from "./use-user-service";

jest.mock("../context", () => ({
  AuthContainerContext: require("../context/auth-container-context")
    .AuthContainerContext,
}));

describe("useUserService", () => {
  it("returns userService from user container", () => {
    // Arrange
    const userService = { getUser: jest.fn() };
    const container = createUserContainerValue({ userService });
    const wrapper = createUserContainerWrapper(container);

    // Act
    const { result } = renderHook(() => useUserService(), { wrapper });

    // Assert
    expect(result.current).toBe(userService);
  });
});
