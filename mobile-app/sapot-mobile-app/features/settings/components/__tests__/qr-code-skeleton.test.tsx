import { render } from "@testing-library/react-native";
import { QrCodeSkeleton } from "../qr-code-skeleton";

it("exposes one QR-code loading progressbar", () => {
  expect(render(<QrCodeSkeleton />).getByLabelText("Loading QR code", { includeHiddenElements: true })).toBeTruthy();
});
