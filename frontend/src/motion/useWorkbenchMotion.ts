import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";
import { durationForMotion, motionDurations, motionEase, motionOffsets } from "./tokens";

gsap.registerPlugin(useGSAP);

export function usePanelEntranceMotion(scope: RefObject<HTMLElement>, motionKey?: unknown) {
  useGSAP(
    () => {
      if (!scope.current) {
        return;
      }
      const duration = durationForMotion(motionDurations.panel);
      gsap.fromTo(
        scope.current,
        { autoAlpha: duration === 0 ? 1 : 0, y: duration === 0 ? 0 : motionOffsets.panelY },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          ease: motionEase.entrance,
          clearProps: "transform,visibility"
        }
      );
    },
    { scope, dependencies: [motionKey], revertOnUpdate: true }
  );
}

export function useDialogEntranceMotion(scope: RefObject<HTMLElement>) {
  useGSAP(
    () => {
      if (!scope.current) {
        return;
      }
      const duration = durationForMotion(motionDurations.dialog);
      gsap.fromTo(
        scope.current,
        { opacity: duration === 0 ? 1 : 0, y: duration === 0 ? 0 : motionOffsets.dialogY, scale: 0.99 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration,
          ease: motionEase.entrance,
          clearProps: "transform,opacity"
        }
      );
    },
    { scope }
  );
}

export function useStaggeredListMotion(
  scope: RefObject<HTMLElement>,
  itemSelector: string,
  motionKey: unknown
) {
  useGSAP(
    () => {
      if (!scope.current) {
        return;
      }
      const duration = durationForMotion(motionDurations.list);
      gsap.fromTo(
        itemSelector,
        { autoAlpha: duration === 0 ? 1 : 0, y: duration === 0 ? 0 : motionOffsets.listY },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          ease: motionEase.list,
          stagger: duration === 0 ? 0 : 0.035,
          clearProps: "transform,visibility"
        }
      );
    },
    { scope, dependencies: [motionKey], revertOnUpdate: true }
  );
}
