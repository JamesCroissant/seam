/**
 * The only script every page gets (a few KB, no React).
 * React is downloaded only when the page has an island.
 */
import { loadIslands } from "./islands-loader.ts";
import { startNav } from "./nav.ts";
import { loadViews } from "./views.ts";

startNav();
if (document.querySelector("seam-island")) {
  loadIslands().then((m) => m.hydrateIslands(document));
}
void loadViews(document);
