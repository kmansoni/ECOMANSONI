import { createContext, useContext, RefObject } from "react";

const ScrollContainerContext = createContext<RefObject<HTMLElement> | null>(null);

export const ScrollContainerProvider = ScrollContainerContext.Provider;

// eslint-disable-next-line react-refresh/only-export-components
export const useScrollContainer = () => useContext(ScrollContainerContext);
