import { useEffect, useState } from "preact/hooks";
import { isMessage, MessageType, type VisibleHunk } from "@/utils/messaging";

export function useScrollSync(): VisibleHunk[] {
  const [visible, setVisible] = useState<VisibleHunk[]>([]);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (!isMessage(message) || message.type !== MessageType.VISIBLE_HUNKS)
        return;
      setVisible(message.payload.visible);
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return visible;
}
