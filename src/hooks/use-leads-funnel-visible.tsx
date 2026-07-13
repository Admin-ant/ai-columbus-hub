import { useEffect, useState } from "react";

const KEY = "portal.showLeadsFunnel";
const EVENT = "portal.showLeadsFunnel.change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function useLeadsFunnelVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    setVisible(read());
    const onChange = () => setVisible(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  function update(v: boolean) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, v ? "1" : "0");
      window.dispatchEvent(new Event(EVENT));
    }
    setVisible(v);
  }

  return [visible, update];
}
