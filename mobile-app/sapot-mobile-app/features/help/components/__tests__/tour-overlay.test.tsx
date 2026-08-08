import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { TourOverlay } from "../tour-overlay";

const mockTour = { status: "running", step: { anchorId: "chats-tab", title: "Chats", body: "Body" }, stepIndex: 0, totalSteps: 3, anchorRect: { x: 20, y: 600, width: 80, height: 40 }, next: jest.fn(), skip: jest.fn(), measureActiveAnchor: jest.fn() };
jest.mock("../../context/tour-context", () => ({ useTour: () => mockTour }));
jest.mock("@/features/shared/hooks", () => ({ useReducedMotion: () => false }));
jest.mock("../tour-step-card", () => ({ TourStepCard: () => null }));
jest.mock("react-native-paper", () => {
  const React = require("react");
  return { Portal: ({ children }: { children: ReactNode }) => <>{children}</>, useTheme: () => ({ colors: { scrim: "rgb(0, 0, 0)", backdrop: "rgba(45, 48, 56, 0.4)", primary: "#3A7AFE" } }) };
});

/** Flattened backgroundColor of every View the overlay renders. */
function backgroundColors(screen: ReturnType<typeof render>): string[] {
  return screen.UNSAFE_getAllByType(View)
    .map((node) => (Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style)?.backgroundColor)
    .filter((color): color is string => typeof color === "string");
}

/** Matches colors with no alpha channel, or an alpha of exactly 1. */
const OPAQUE = /^(rgb\(|#(?:[0-9a-f]{3}|[0-9a-f]{6})$)|^rgba\([^)]*,\s*1(\.0+)?\s*\)$/i;

describe("TourOverlay backdrop", () => {
  it("dims the screen instead of blacking it out when an anchor is measured", () => {
    const screen = render(<TourOverlay />);
    const painted = backgroundColors(screen);

    expect(painted.length).toBeGreaterThan(0);
    expect(painted.filter((color) => OPAQUE.test(color))).toEqual([]);
  });

  it("dims the screen instead of blacking it out when no anchor is measured", () => {
    const withoutAnchor = { ...mockTour, anchorRect: undefined };
    jest.spyOn(require("../../context/tour-context"), "useTour").mockReturnValue(withoutAnchor);

    jest.useFakeTimers();
    const screen = render(<TourOverlay />);
    jest.advanceTimersByTime(1000);
    screen.rerender(<TourOverlay />);
    const painted = backgroundColors(screen);
    jest.useRealTimers();

    expect(painted.filter((color) => OPAQUE.test(color))).toEqual([]);
  });
});
