(() => {
  console.log("[Search Everywhere] Extension loaded");

  // Configuration
  const CONFIG = {
    maxRetries: 5,
    retryDelay: 100,
    observerTimeout: 3000,
    debugMode: false,
  };

  const log = (...args) => {
    if (CONFIG.debugMode) {
      console.log("[Search Everywhere]", ...args);
    }
  };

  // Track if we've already acted on the current search session
  let hasActedThisSession = false;
  let currentSearchValue = "";
  let activeObserver = null;
  let activeRetryTimeout = null;

  // Find the search input
  const findSearchInput = () => {
    const selectors = [
      'input[aria-label="Quick Search"]',
      'input[data-target-id="SearchInput-searchFilesAndFolders"]',
      'input[type="search"]',
      'input[role="combobox"]',
      'input[role="searchbox"]',
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) {
        log("Found search input with selector:", selector);
        return input;
      }
    }
    return null;
  };

  // Check if search popup is visible
  const isSearchPopupVisible = () => {
    const popup = document.querySelector(
      '[role="dialog"][aria-label="Quick Search"]',
    );
    return popup && popup.offsetParent !== null;
  };

  // Find and click the "Everywhere" button (only once per session)
  const clickEverywhereButton = () => {
    if (hasActedThisSession) {
      log("Already acted this session, skipping");
      return true; // Return true to stop retrying
    }

    // Try multiple selectors for the Everywhere button
    const selectors = [
      "#context-tabs-0",
      'button[data-target-id="FilterChip-searchEverywhereFilterTab"]',
    ];

    for (const selector of selectors) {
      try {
        const button = document.querySelector(selector);
        if (button) {
          // Check if it's the Everywhere button and not already selected
          const labelElement =
            button.querySelector('[data-text="Everywhere"]') ||
            button.querySelector("span");
          const labelText =
            labelElement?.textContent?.trim() ||
            labelElement?.getAttribute("data-text") ||
            "";

          if (labelText === "Everywhere") {
            const isSelected =
              button.getAttribute("aria-checked") === "true" ||
              button.getAttribute("data-state") === "on";

            if (!isSelected) {
              log("Clicking Everywhere button (first time this session)");
              button.click();
              hasActedThisSession = true;
              return true;
            } else {
              log("Everywhere button already selected");
              hasActedThisSession = true;
              return true;
            }
          }
        }
      } catch (error) {
        log("Error trying selector:", selector, error);
      }
    }

    // Fallback: look for any button containing "Everywhere" text
    const allButtons = document.querySelectorAll("button");
    for (const button of allButtons) {
      if (button.textContent?.includes("Everywhere")) {
        const isSelected =
          button.getAttribute("aria-checked") === "true" ||
          button.getAttribute("data-state") === "on";

        if (!isSelected) {
          log(
            "Clicking Everywhere button (fallback method, first time this session)",
          );
          button.click();
          hasActedThisSession = true;
          return true;
        } else {
          log("Everywhere button already selected (fallback)");
          hasActedThisSession = true;
          return true;
        }
      }
    }

    return false;
  };

  // Wait for the button to appear and click it (with limited retries)
  const waitForButtonAndClick = () => {
    if (hasActedThisSession) return;

    // Clear any existing retry timeout
    if (activeRetryTimeout) {
      clearTimeout(activeRetryTimeout);
      activeRetryTimeout = null;
    }

    let attempts = 0;
    const tryClick = () => {
      attempts++;
      log(`Attempt ${attempts} to find Everywhere button`);

      if (clickEverywhereButton()) {
        log("Successfully found and handled Everywhere button");
        activeRetryTimeout = null;
        return;
      }

      if (attempts < CONFIG.maxRetries && !hasActedThisSession) {
        activeRetryTimeout = setTimeout(tryClick, CONFIG.retryDelay);
      } else {
        log("No Everywhere button found after", CONFIG.maxRetries, "attempts");
        hasActedThisSession = true; // Don't keep trying
        activeRetryTimeout = null;
      }
    };

    tryClick();
  };

  // Set up mutation observer to watch for the search popup appearing
  const observeForSearchPopup = () => {
    if (hasActedThisSession) return;

    // Disconnect any existing observer
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }

    activeObserver = new MutationObserver(() => {
      if (hasActedThisSession) {
        activeObserver.disconnect();
        activeObserver = null;
        return;
      }

      if (isSearchPopupVisible() && clickEverywhereButton()) {
        log("Found and clicked button via mutation observer");
        activeObserver.disconnect();
        activeObserver = null;
        // Clear any pending retries since we succeeded
        if (activeRetryTimeout) {
          clearTimeout(activeRetryTimeout);
          activeRetryTimeout = null;
        }
      }
    });

    activeObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-expanded"],
    });

    // Cleanup after timeout
    setTimeout(() => {
      if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
        log("Search popup observer timed out");
      }
    }, CONFIG.observerTimeout);
  };

  // Reset session when search loses focus
  const resetSession = () => {
    log("Resetting search session");
    hasActedThisSession = false;
    currentSearchValue = "";

    // Clean up any active observers or timeouts
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }
    if (activeRetryTimeout) {
      clearTimeout(activeRetryTimeout);
      activeRetryTimeout = null;
    }
  };

  // Handle search input focus
  const handleSearchFocus = (searchInput) => {
    log("Search input focused");
    currentSearchValue = searchInput.value.trim();

    // If there's already text in the search box and we haven't acted yet,
    // try to click Everywhere (user clicked back into existing search)
    if (currentSearchValue.length > 0 && !hasActedThisSession) {
      log("Search box already has text, waiting for popup to appear");

      // Start observing immediately for popup changes
      observeForSearchPopup();

      // Wait a moment for the popup to appear, then try to click
      setTimeout(() => {
        if (!hasActedThisSession && isSearchPopupVisible()) {
          if (clickEverywhereButton()) {
            log("Successfully clicked Everywhere on refocus");
          } else {
            // If not found immediately, start retrying
            waitForButtonAndClick();
          }
        }
      }, 200); // Wait 200ms for popup to appear
    }
  };

  // Handle search input blur (when user clicks away)
  const handleSearchBlur = () => {
    log("Search input lost focus, resetting session");
    resetSession();
  };

  // Handle input changes
  const handleSearchInput = (searchInput) => {
    const newValue = searchInput.value.trim();

    // If search was cleared, reset session so we can act again on new typing
    if (newValue.length === 0 && currentSearchValue.length > 0) {
      log("Search cleared, resetting session for new search");
      hasActedThisSession = false;
    }

    // Only act if user has typed something and we haven't acted yet
    if (newValue.length > 0 && !hasActedThisSession) {
      log("User started typing, waiting for search popup to appear");

      // Start observing immediately for popup changes
      observeForSearchPopup();

      // Wait a moment for the popup to appear, then try to click
      setTimeout(() => {
        if (!hasActedThisSession && isSearchPopupVisible()) {
          if (clickEverywhereButton()) {
            log("Successfully clicked Everywhere after typing");
          } else {
            // If not found immediately, start retrying
            waitForButtonAndClick();
          }
        }
      }, 200); // Wait 200ms for popup to appear
    }

    currentSearchValue = newValue;
  };

  // Initialize the extension
  const init = () => {
    const searchInput = findSearchInput();

    if (!searchInput) {
      log("Search input not found, retrying in 1 second...");
      setTimeout(init, 1000);
      return;
    }

    log("Search input found, setting up event listeners");

    // Remove any existing listeners to avoid duplicates
    searchInput.removeEventListener("focus", () =>
      handleSearchFocus(searchInput),
    );
    searchInput.removeEventListener("blur", handleSearchBlur);
    searchInput.removeEventListener("input", () =>
      handleSearchInput(searchInput),
    );

    // Add event listeners
    searchInput.addEventListener("focus", () => handleSearchFocus(searchInput));
    searchInput.addEventListener("blur", handleSearchBlur);
    searchInput.addEventListener("input", () => handleSearchInput(searchInput));

    // Initialize current search value
    currentSearchValue = searchInput.value.trim();

    log("Extension initialized successfully");
  };

  // Start initialization when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Handle SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      log("URL changed, resetting and reinitializing...");
      hasActedThisSession = false;
      currentSearchValue = "";
      setTimeout(init, 500);
    }
  }).observe(document, { subtree: true, childList: true });
})();
