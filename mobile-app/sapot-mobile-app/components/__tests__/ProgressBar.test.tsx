import { act, render } from "@testing-library/react-native";
import React from "react";
import { LottieProgressBar } from "../ProgressBar";

describe("LottieProgressBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders the progress bar", () => {
    const { getByTestId } = render(<LottieProgressBar />);
    expect(getByTestId("lottie-view")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
  });
});
