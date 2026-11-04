import { GO_ORIGIN, SESSION_COOKIE_NAME } from "./config.js";

const IDLE_SECONDS = 900;
const GO_HOST = new URL(GO_ORIGIN).hostname.toLowerCase();

// Open the side panel when the toolbar icon is clicked.
// Registered once at startup, not inside onClicked, so the first click works.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })

// Content script button -> open side panel.
// sidePanel.open() must run synchronously inside the user gesture,
// so no async lookups before it.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return // ignore foreign senders
  if (!message || message.type !== 'openSidebar') return

  const tabId = sender.tab?.id
  if (!chrome.sidePanel?.open || tabId === undefined) return

  try {
    chrome.sidePanel.open({ tabId })
  } catch (error) {
    console.error(error)
  }
})

async function setSessionState(state) {
  try {
    await chrome.storage.session.set(state);
  } catch {
    console.error("Could not update extension session state.");
  }
}

async function syncAuthenticationFromCookie() {
  try {
    const cookie = await chrome.cookies.get({
      url: GO_ORIGIN,
      name: SESSION_COOKIE_NAME,
    });
    await setSessionState({ isAuthenticated: Boolean(cookie) });
  } catch {
    console.error("Could not read the GO session cookie.");
  }
}

function syncIdleState() {
  chrome.idle.queryState(IDLE_SECONDS, (state) => {
    if (chrome.runtime.lastError) {
      console.error("Could not read the current idle state.");
      return;
    }
    void setSessionState({ isIdle: state !== "active" });
  });
}

chrome.runtime.onStartup.addListener(() => {
  void syncAuthenticationFromCookie();
  syncIdleState();
});

chrome.runtime.onInstalled.addListener(() => {
  void syncAuthenticationFromCookie();
  syncIdleState();
});

chrome.cookies.onChanged.addListener(({ cookie, removed, cause }) => {
  const cookieHost = cookie.domain.replace(/^\./, "").toLowerCase();
  if (cookie.name !== SESSION_COOKIE_NAME || cookieHost !== GO_HOST) return;
  if (removed && cause === "overwrite") return;
  void setSessionState({ isAuthenticated: !removed });
});

chrome.idle.setDetectionInterval(IDLE_SECONDS);
chrome.idle.onStateChanged.addListener((state) => {
  void setSessionState({ isIdle: state !== "active" });
});
