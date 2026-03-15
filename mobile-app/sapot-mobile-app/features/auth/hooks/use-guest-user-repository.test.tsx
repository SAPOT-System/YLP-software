import {
  createUserContainerValue,
  createUserContainerWrapper,
} from "@/test/mocks/auth-container-context.mock";
import { renderHook } from "@testing-library/react-native";
import { useGuestUserRepository } from "./use-guest-user-repository";

jest.mock("../context", () => ({
  AuthContainerContext: require("../context/auth-container-context")
    .AuthContainerContext,
}));

describe("useGuestUserRepository", () => {
  it("returns guestUserRepository from user container", () => {
    // Arrange
    const guestUserRepository = { getCurrentGuestUser: jest.fn() };
    const container = createUserContainerValue({ guestUserRepository });
    const wrapper = createUserContainerWrapper(container);

    // Act
    const { result } = renderHook(() => useGuestUserRepository(), { wrapper });

    // Assert
    expect(result.current).toBe(guestUserRepository);
  });
});
