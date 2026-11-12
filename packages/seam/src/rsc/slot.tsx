"use client";
/**
 * <Slot name="actions" props={{ id }} /> inside a Server Component (an RSC view) marks a place
 * where the browser plugs in its own component: <RscView slots={{ actions: MyButtons }} />.
 *
 * The server draws the frame; the client owns what goes into the holes.
 * Slot props travel through RSC, so they must be serializable (no functions).
 */
import { createContext, createElement, use, type ComponentType, type ReactNode } from "react";

export type Slots = Record<string, ComponentType<any>>;

export const SlotContext = createContext<Slots>({});

export function Slot({ name, props, children }: { name: string; props?: Record<string, unknown>; children?: ReactNode }) {
  const Component = use(SlotContext)[name];
  return Component ? createElement(Component, props ?? {}) : (children ?? null);
}
