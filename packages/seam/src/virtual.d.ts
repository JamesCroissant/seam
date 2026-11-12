declare module "virtual:seam/islands" {
  export const islands: Record<string, () => Promise<Record<string, unknown>>>;
}

declare module "virtual:seam/app" {
  export const app: import("./core/types.ts").App;
}
