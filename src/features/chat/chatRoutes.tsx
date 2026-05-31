/**
 * Chat routes — lazy-loaded chat module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const SavedMessagesPage = lazy(() => import("../../pages/SavedMessagesPage").then(m => ({ default: m.default })));
const RemindersPage = lazy(() => import("../../pages/RemindersPage").then(m => ({ default: m.default })));
const EmailPage = lazy(() => import("../../pages/EmailPage").then(m => ({ default: m.default })));
const EmailSettingsPage = lazy(() => import("../../pages/EmailSettingsPage").then(m => ({ default: m.default })));

export const chatRoutes = (): RouteObject[] => [
  { path: "/saved-messages", lazy: () => Promise.resolve({ Component: SavedMessagesPage }) },
  { path: "/reminders", lazy: () => Promise.resolve({ Component: RemindersPage }) },
  { path: "/email/settings", lazy: () => Promise.resolve({ Component: EmailSettingsPage }) },
  { path: "/email", lazy: () => Promise.resolve({ Component: EmailPage }) },
];