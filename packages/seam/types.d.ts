// Types for the modules the Seam Vite plugin generates.
// Add to your tsconfig: { "compilerOptions": { "types": ["seam/types"] } }
declare module "virtual:seam/app" {
  export const app: import("seam").App;
}
