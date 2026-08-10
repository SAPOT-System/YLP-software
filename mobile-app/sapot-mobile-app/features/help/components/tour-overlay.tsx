import { useReducedMotion } from "@/features/shared/hooks";
import { useEffect, useState } from "react";
import { Keyboard, useWindowDimensions, View } from "react-native";
import { Portal, useTheme } from "react-native-paper";
import { ANCHOR_WAIT_MS } from "../constants";
import { useTour } from "../context/tour-context";
import { TourStepCard } from "./tour-step-card";

const CARD_MARGIN = 16; const HIGHLIGHT_PADDING = 6;
export function TourOverlay() {
  const { status, step, stepIndex, totalSteps, anchorRect, next, skip, measureActiveAnchor } = useTour();
  const { width, height } = useWindowDimensions(); const theme = useTheme(); const reducedMotion = useReducedMotion(); const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => { if (status !== "running") return; measureActiveAnchor(); setGraceElapsed(false); const timer = setTimeout(() => setGraceElapsed(true), ANCHOR_WAIT_MS); return () => clearTimeout(timer); }, [measureActiveAnchor, status, stepIndex]);
  useEffect(() => { if (status !== "running") return; const show = Keyboard.addListener("keyboardDidShow", measureActiveAnchor); const hide = Keyboard.addListener("keyboardDidHide", measureActiveAnchor); measureActiveAnchor(); return () => { show.remove(); hide.remove(); }; }, [height, measureActiveAnchor, status, width]);
  if (status !== "running" || !step || (!anchorRect && !graceElapsed)) return null;
  const card = <TourStepCard title={step.title} body={step.body} stepIndex={stepIndex} totalSteps={totalSteps} onNext={next} onSkip={skip} />;
  // `scrim` is an opaque black token meant to be composited at a reduced opacity; `backdrop` is the
  // theme's ready-made translucent dim (the one Paper's own Modal uses), so the app stays visible behind the tour.
  const backdrop = theme.colors.backdrop;
  if (!anchorRect) return <Portal><View style={{ position: "absolute", inset: 0, backgroundColor: backdrop, justifyContent: "center", padding: CARD_MARGIN }}>{card}</View></Portal>;
  const top = Math.max(0, anchorRect.y - HIGHLIGHT_PADDING); const left = Math.max(0, anchorRect.x - HIGHLIGHT_PADDING); const boxWidth = anchorRect.width + HIGHLIGHT_PADDING * 2; const boxHeight = anchorRect.height + HIGHLIGHT_PADDING * 2; const placeCardBelow = height - (top + boxHeight) > height / 3;
  return <Portal><View style={{ position: "absolute", inset: 0 }}><View style={{ position: "absolute", top: 0, left: 0, right: 0, height: top, backgroundColor: backdrop }} /><View style={{ position: "absolute", top: top + boxHeight, left: 0, right: 0, bottom: 0, backgroundColor: backdrop }} /><View style={{ position: "absolute", top, left: 0, width: left, height: boxHeight, backgroundColor: backdrop }} /><View style={{ position: "absolute", top, left: left + boxWidth, right: 0, height: boxHeight, backgroundColor: backdrop }} /><View pointerEvents="none" style={{ position: "absolute", top, left, width: boxWidth, height: boxHeight, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.primary, opacity: reducedMotion ? 1 : 0.95 }} /><View style={{ position: "absolute", left: CARD_MARGIN, right: CARD_MARGIN, ...(placeCardBelow ? { top: top + boxHeight + CARD_MARGIN } : { bottom: height - top + CARD_MARGIN }) }}>{card}</View></View></Portal>;
}
