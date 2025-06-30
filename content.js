(() => {
  // 1) Grab your search box once
  const searchInput = document.querySelector(
    "input[type=search], input[role=searchbox]",
  );
  if (!searchInput) return; // bail if it's not there

  // 2) Try to click the button if it exists
  const clickEverywhereIfReady = () => {
    const btn = document.getElementById("context-tabs-0");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  };

  // 3) Watch the DOM until clickEverywhereIfReady() returns true
  const observeForButton = () => {
    const observer = new MutationObserver((_, obs) => {
      if (clickEverywhereIfReady()) {
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Safety cleanup after 8 seconds to prevent memory leaks
    setTimeout(() => observer.disconnect(), 8000);
  };

  // 4) On every focus: either click immediately or start observing
  searchInput.addEventListener("focus", () => {
    if (!clickEverywhereIfReady()) {
      observeForButton();
    }
  });
})();
