import { uiLog } from "@/features/shared/core/utils/logger";
import type React from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent, View } from "react-native";
import { TOUR_STEPS } from "../content/tour-steps";
import { useHelpContext } from "../hooks/use-help-context";
import { isVisible } from "../services/help-visibility";
import { claimTourStart } from "../services/tour-persistence";
import type { AnchorId, TourStep } from "../types";

export type AnchorRect = { x: number; y: number; width: number; height: number };
export type TourStatus = "idle" | "running" | "done";
type AnchorViews = Partial<Record<AnchorId, View | null>>;

type TourContextValue = {
  status: TourStatus; step: TourStep | undefined; stepIndex: number; totalSteps: number;
  anchorRect: AnchorRect | undefined; start: () => Promise<void>; next: () => void; skip: () => void;
  registerAnchor: (id: AnchorId, rect: AnchorRect) => void;
  registerAnchorView: (id: AnchorId, view: View | null) => void;
  measureActiveAnchor: () => void;
};
const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const helpContext = useHelpContext();
  const [status, setStatus] = useState<TourStatus>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [anchors, setAnchors] = useState<Partial<Record<AnchorId, AnchorRect>>>({});
  const anchorViews = useRef<AnchorViews>({});
  const steps = useMemo(() => TOUR_STEPS.filter((step) => isVisible(step.audience, helpContext)), [helpContext]);

  const registerAnchor = useCallback((id: AnchorId, rect: AnchorRect) => {
    setAnchors((current) => {
      const previous = current[id];
      if (previous && previous.x === rect.x && previous.y === rect.y && previous.width === rect.width && previous.height === rect.height) return current;
      return { ...current, [id]: rect };
    });
  }, []);
  const registerAnchorView = useCallback((id: AnchorId, view: View | null) => { anchorViews.current[id] = view; }, []);
  const step = status === "running" ? steps[stepIndex] : undefined;
  const measureActiveAnchor = useCallback(() => {
    if (!step) return;
    anchorViews.current[step.anchorId]?.measureInWindow((x, y, width, height) => {
      if (width > 0 || height > 0) registerAnchor(step.anchorId, { x, y, width, height });
    });
  }, [registerAnchor, step]);
  const start = useCallback(async () => {
    if (!(await claimTourStart())) return;
    uiLog.info("[help] tour started", { steps: steps.length });
    setStepIndex(0); setStatus("running");
  }, [steps.length]);
  const finish = useCallback((reason: "completed" | "skipped") => { uiLog.info("[help] tour ended", { reason }); setStatus("done"); }, []);
  const next = useCallback(() => setStepIndex((current) => {
    if (current + 1 >= steps.length) { finish("completed"); return current; }
    return current + 1;
  }), [finish, steps.length]);
  const skip = useCallback(() => finish("skipped"), [finish]);
  const value = useMemo(() => ({ status, step, stepIndex, totalSteps: steps.length, anchorRect: step ? anchors[step.anchorId] : undefined, start, next, skip, registerAnchor, registerAnchorView, measureActiveAnchor }), [anchors, measureActiveAnchor, next, registerAnchor, registerAnchorView, skip, start, status, step, stepIndex, steps.length]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue { const value = useContext(TourContext); if (!value) throw new Error("useTour must be used within a TourProvider"); return value; }
export function useTourAnchor(id: AnchorId) {
  const { registerAnchor, registerAnchorView } = useTour();
  const node = useRef<View | null>(null);
  const measure = useCallback(() => node.current?.measureInWindow((x, y, width, height) => { if (width > 0 || height > 0) registerAnchor(id, { x, y, width, height }); }), [id, registerAnchor]);
  const ref = useCallback((view: View | null) => { node.current = view; registerAnchorView(id, view); }, [id, registerAnchorView]);
  const onLayout = useCallback((_event: LayoutChangeEvent) => measure(), [measure]);
  return { ref, onLayout, measure };
}
