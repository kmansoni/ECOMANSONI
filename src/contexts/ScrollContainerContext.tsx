import { createContext, useContext, RefObject } from "react";

const ScrollContainerContext = createContext<RefObject<HTMLElement> | null>(null);

export const ScrollContainerProvider = ScrollContainerContext.Provider;

export const useScrollContainer = () => useContext(ScrollContainerContext);
