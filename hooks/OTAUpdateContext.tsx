import { createContext, useContext } from "react";

interface OTAUpdateContextValue {
  updateReady: boolean;
  restarting: boolean;
  updateMessage: string | undefined;
  restart: () => Promise<void>;
}

export const OTAUpdateContext = createContext<OTAUpdateContextValue>({
  updateReady: false,
  restarting: false,
  updateMessage: undefined,
  restart: async () => {},
});

export function useOTAUpdateContext(): OTAUpdateContextValue {
  return useContext(OTAUpdateContext);
}
