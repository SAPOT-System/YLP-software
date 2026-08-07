import {
  clearHelpTourCompleted,
  getHelpTourCompleted,
  saveHelpTourCompleted,
} from "@/features/shared/core/stores/secure-config";
import { uiLog } from "@/features/shared/core/utils/logger";
import { CURRENT_TOUR_VERSION } from "../constants";

export async function shouldAutostartTour(): Promise<boolean> {
  try {
    const completed = await getHelpTourCompleted();
    return completed === undefined || completed < CURRENT_TOUR_VERSION;
  } catch (error) {
    uiLog.error("[help] tour flag unreadable, suppressing autostart", { error });
    return false;
  }
}

export async function claimTourStart(): Promise<boolean> {
  try {
    await saveHelpTourCompleted(CURRENT_TOUR_VERSION);
    const readBack = await getHelpTourCompleted();
    if (readBack !== CURRENT_TOUR_VERSION) {
      uiLog.error("[help] tour flag write not confirmed, suppressing autostart", { readBack });
      return false;
    }
    return true;
  } catch (error) {
    uiLog.error("[help] tour flag write failed, suppressing autostart", { error });
    return false;
  }
}

export async function resetTourCompletion(): Promise<void> {
  try {
    await clearHelpTourCompleted();
  } catch (error) {
    uiLog.warn("[help] could not clear tour flag; replaying anyway", { error });
  }
}
