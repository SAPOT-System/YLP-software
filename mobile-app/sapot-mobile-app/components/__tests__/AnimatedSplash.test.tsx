import { act, render } from "@testing-library/react-native";
import React from "react";
import { AnimatedSplash } from "../AnimatedSplash";

describe("AnimatedSplash", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("calls onFinish after 6 seconds", () => {
    const onFinish = jest.fn();
    render(<AnimatedSplash onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
