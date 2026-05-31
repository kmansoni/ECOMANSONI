/**
 * Livestream routes — lazy-loaded livestream module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const GoLivePage = lazy(() => import("../../pages/GoLivePage"));
const LiveViewerPage = lazy(() => import("../../pages/LiveViewerPage"));
const LiveExplorePage = lazy(() => import("../../pages/LiveExplorePage"));

export const livestreamRoutes = (): RouteObject[] => [
  { path: "/live", lazy: () => Promise.resolve({ Component: GoLivePage }) },
  { path: "/live/explore", lazy: () => Promise.resolve({ Component: LiveExplorePage }) },
  { path: "/live/:sessionId", lazy: () => Promise.resolve({ Component: LiveViewerPage }) },
];