import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // The window never scrolls here — AppShell's <main> is the page scroller.
    // Scroll restoration carries every tracked element's position forward onto
    // the next location unless the element is named here, so without this a
    // fresh navigation re-applies the previous page's scrollTop to <main>.
    // Back/forward still restores: a cached entry for the destination wins.
    scrollToTopSelectors: ["main"],
    defaultPreloadStaleTime: 0,
  });

  return router;
};
