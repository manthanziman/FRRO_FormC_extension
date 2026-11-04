import { useEffect, useState } from "react";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    let active = true;
    let changedBeforeRead = false;

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== "session" || !changes.isAuthenticated) return;
      changedBeforeRead = true;
      setIsAuthenticated(changes.isAuthenticated.newValue === true);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.storage.session.get("isAuthenticated").then((state) => {
      if (active && !changedBeforeRead) {
        setIsAuthenticated(state.isAuthenticated === true);
      }
    }).catch(() => {
      console.error("Could not read extension authentication state.");
      if (active && !changedBeforeRead) setIsAuthenticated(false);
    });

    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return isAuthenticated;
}

export function useIdle() {
  const [isIdle, setIsIdle] = useState(null);

  useEffect(() => {
    let active = true;
    let changedBeforeRead = false;

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== "session" || !changes.isIdle) return;
      changedBeforeRead = true;
      setIsIdle(changes.isIdle.newValue === true);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.storage.session.get("isIdle").then((state) => {
      if (active && !changedBeforeRead) setIsIdle(state.isIdle === true);
    }).catch(() => {
      console.error("Could not read extension idle state.");
      if (active && !changedBeforeRead) setIsIdle(false);
    });

    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return isIdle;
}
