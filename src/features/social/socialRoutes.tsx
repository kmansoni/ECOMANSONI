/**
 * Social routes — lazy-loaded social module (user profiles, stories, AR, music).
 */
import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const UserProfilePage = lazy(() => import("../../pages/UserProfilePage").then(m => ({ default: m.UserProfilePage })));
const ContactProfilePage = lazy(() => import("../../pages/ContactProfilePage").then(m => ({ default: m.ContactProfilePage })));
const FollowRequestsPage = lazy(() => import("../../pages/FollowRequestsPage").then(m => ({ default: m.default })));
const BusinessAccountPage = lazy(() => import("../../pages/BusinessAccountPage").then(m => ({ default: m.default })));
const CreatorFundPage = lazy(() => import("../../pages/CreatorFundPage").then(m => ({ default: m.default })));
const CreatorSubscriptionsPage = lazy(() => import("../../pages/CreatorSubscriptionsPage").then(m => ({ default: m.default })));
const StoryArchivePage = lazy(() => import("../../pages/StoryArchivePage").then(m => ({ default: m.default })));
const AudioTrackPage = lazy(() => import("../../pages/AudioTrackPage").then(m => ({ default: m.default })));
const ARPage = lazy(() => import("../../pages/ARPage").then(m => ({ default: m.ARPage })));
const AudioRoomsPage = lazy(() => import("../../pages/AudioRoomsPage").then(m => ({ default: m.AudioRoomsPage })));
const MusicPage = lazy(() => import("../../pages/MusicPage").then(m => ({ default: m.default })));
const AIAssistantPage = lazy(() => import("../../pages/AIAssistantPage").then(m => ({ default: m.default })));
const CreatorStudioPage = lazy(() => import("../../pages/CreatorStudio").then(m => ({ default: m.default })));
const ExploreFeedPage = lazy(() => import("../../pages/ExploreFeedPage").then(m => ({ default: m.ExploreFeedPage })));

export const socialRoutes = (): RouteObject[] => [
  { path: "/user/:username", lazy: () => Promise.resolve({ Component: UserProfilePage }) },
  { path: "/contact/:userId", lazy: () => Promise.resolve({ Component: ContactProfilePage }) },
  { path: "/follow-requests", lazy: () => Promise.resolve({ Component: FollowRequestsPage }) },
  { path: "/business", lazy: () => Promise.resolve({ Component: BusinessAccountPage }) },
  { path: "/creator-fund", lazy: () => Promise.resolve({ Component: CreatorFundPage }) },
  { path: "/creator-subscriptions", lazy: () => Promise.resolve({ Component: CreatorSubscriptionsPage }) },
  { path: "/creator-subscriptions/:creatorId", lazy: () => Promise.resolve({ Component: CreatorSubscriptionsPage }) },
  { path: "/story-archive", lazy: () => Promise.resolve({ Component: StoryArchivePage }) },
  { path: "/audio/:trackTitle", lazy: () => Promise.resolve({ Component: AudioTrackPage }) },
  { path: "/ar", lazy: () => Promise.resolve({ Component: ARPage }) },
  { path: "/audio-rooms", lazy: () => Promise.resolve({ Component: AudioRoomsPage }) },
  { path: "/audio-rooms/:roomId", lazy: () => Promise.resolve({ Component: AudioRoomsPage }) },
  { path: "/services/music/*", lazy: () => Promise.resolve({ Component: MusicPage }) },
  { path: "/services/music", lazy: () => Promise.resolve({ Component: MusicPage }) },
  { path: "/ai-assistant", lazy: () => Promise.resolve({ Component: AIAssistantPage }) },
  { path: "/creator-studio", lazy: () => Promise.resolve({ Component: CreatorStudioPage }) },
  { path: "/explore/:postIndex", lazy: () => Promise.resolve({ Component: ExploreFeedPage }) },
];