import { CURRENT_TOUR_VERSION } from "../../constants";
import { claimTourStart, shouldAutostartTour } from "../tour-persistence";
import { getHelpTourCompleted, saveHelpTourCompleted } from "@/features/shared/core/stores/secure-config";

jest.mock("@/features/shared/core/stores/secure-config", () => ({
  getHelpTourCompleted: jest.fn(), saveHelpTourCompleted: jest.fn(), clearHelpTourCompleted: jest.fn(),
}));
const mockGet = getHelpTourCompleted as jest.MockedFunction<typeof getHelpTourCompleted>;
const mockSave = saveHelpTourCompleted as jest.MockedFunction<typeof saveHelpTourCompleted>;

describe("tour persistence", () => {
  beforeEach(() => jest.clearAllMocks());
  it("autostarts only for missing or older versions", async () => {
    mockGet.mockResolvedValue(undefined);
    await expect(shouldAutostartTour()).resolves.toBe(true);
    mockGet.mockResolvedValue(CURRENT_TOUR_VERSION);
    await expect(shouldAutostartTour()).resolves.toBe(false);
    mockGet.mockRejectedValue(new Error("unavailable"));
    await expect(shouldAutostartTour()).resolves.toBe(false);
  });
  it("claims a verified version write", async () => {
    mockSave.mockResolvedValue(); mockGet.mockResolvedValue(CURRENT_TOUR_VERSION);
    await expect(claimTourStart()).resolves.toBe(true);
    expect(mockSave).toHaveBeenCalledWith(CURRENT_TOUR_VERSION);
  });
});
