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
