import { render } from "@testing-library/react-native";
import React from "react";
import { ZeroconfStatusIndicator } from "../zeroconf-status-indicator";

describe("ZeroconfStatusIndicator", () => {
  it("renders when zeroconf is allowed and published", () => {
    const { UNSAFE_getByType } = render(
      <ZeroconfStatusIndicator isPublished={true} isZeroconfAllowed={true} />
    );

    // Should render without throwing
    expect(UNSAFE_getByType(ZeroconfStatusIndicator)).toBeTruthy();
  });

  it("renders when zeroconf is allowed and not published", () => {
    const { UNSAFE_getByType } = render(
      <ZeroconfStatusIndicator isPublished={false} isZeroconfAllowed={true} />
    );

    expect(UNSAFE_getByType(ZeroconfStatusIndicator)).toBeTruthy();
  });

  it("renders nothing when zeroconf is not allowed", () => {
    const { toJSON } = render(
      <ZeroconfStatusIndicator isPublished={true} isZeroconfAllowed={false} />
    );

    expect(toJSON()).toBeNull();
  });

  it("renders nothing when both zeroconf not allowed and not published", () => {
    const { toJSON } = render(
      <ZeroconfStatusIndicator isPublished={false} isZeroconfAllowed={false} />
    );

    expect(toJSON()).toBeNull();
  });
});
