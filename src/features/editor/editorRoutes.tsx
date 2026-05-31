/**
 * Editor routes — lazy-loaded video editor module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const EditorProjectsPage = lazy(() => import("../../pages/EditorProjectsPage"));
const EditorPage = lazy(() => import("../../pages/EditorPage"));

export const editorRoutes = (): RouteObject[] => [
  { path: "/editor", lazy: () => Promise.resolve({ Component: EditorProjectsPage }) },
  { path: "/editor/:projectId", lazy: () => Promise.resolve({ Component: EditorPage }) },
];