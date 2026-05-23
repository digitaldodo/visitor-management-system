const DEFAULT_BACKGROUND_INTERVAL_MS = 60000;
const DEFAULT_LIST_BATCH_SIZE = 40;

export function createNonOverlappingPoller(callback, options = {}) {
  const {
    intervalMs = 15000,
    backgroundIntervalMs = Math.max(DEFAULT_BACKGROUND_INTERVAL_MS, intervalMs * 2),
    immediate = true,
    onError = () => {},
  } = options;
  let timer = 0;
  let running = false;
  let stopped = true;

  const clearTimer = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  };

  const nextDelay = () => (document.hidden ? backgroundIntervalMs : intervalMs);

  const schedule = (delayMs = nextDelay()) => {
    if (stopped) {
      return;
    }
    clearTimer();
    timer = window.setTimeout(() => {
      void run("timer");
    }, Math.max(0, delayMs));
  };

  const run = async (reason = "manual") => {
    if (stopped || running) {
      return;
    }
    running = true;
    clearTimer();
    try {
      await callback({ reason, visible: !document.hidden });
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      schedule();
    }
  };

  const visibilityHandler = () => {
    if (stopped) {
      return;
    }
    if (document.hidden) {
      schedule(backgroundIntervalMs);
      return;
    }
    schedule(250);
  };

  return {
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      document.addEventListener("visibilitychange", visibilityHandler);
      if (immediate) {
        void run("start");
      } else {
        schedule();
      }
    },
    stop() {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", visibilityHandler);
    },
    runNow() {
      return run("manual");
    },
  };
}

export function createLatestOnlyTask(callback) {
  let revision = 0;
  let inFlight = null;

  return async function runLatest(...args) {
    const taskRevision = ++revision;
    if (inFlight) {
      await inFlight.catch(() => undefined);
      if (taskRevision !== revision) {
        return null;
      }
    }

    inFlight = Promise.resolve()
      .then(() => callback({
        isCurrent: () => taskRevision === revision,
        revision: taskRevision,
      }, ...args))
      .finally(() => {
        if (taskRevision === revision) {
          inFlight = null;
        }
      });
    return inFlight;
  };
}

export function scheduleIdle(callback, timeout = 600) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout });
  }
  return window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 16);
}

export function cancelIdle(handle) {
  if (!handle) {
    return;
  }
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

export function renderHtmlIfChanged(element, html) {
  if (!element || element.__accessFlowLastHtml === html) {
    return false;
  }
  element.__accessFlowLastHtml = html;
  element.innerHTML = html;
  return true;
}

export function renderMappedList(element, items, mapper, options = {}) {
  const {
    emptyHtml = "",
    batchSize = DEFAULT_LIST_BATCH_SIZE,
    afterRender = () => {},
  } = options;
  if (!element) {
    return;
  }

  const safeItems = Array.isArray(items) ? items : [];
  const token = (element.__accessFlowRenderToken || 0) + 1;
  element.__accessFlowRenderToken = token;
  if (element.__accessFlowIdleHandle) {
    cancelIdle(element.__accessFlowIdleHandle);
    element.__accessFlowIdleHandle = 0;
  }

  if (!safeItems.length) {
    if (renderHtmlIfChanged(element, emptyHtml)) {
      afterRender(element);
    }
    return;
  }

  if (safeItems.length <= batchSize) {
    const html = safeItems.map(mapper).join("");
    if (renderHtmlIfChanged(element, html)) {
      afterRender(element);
    }
    return;
  }

  element.__accessFlowLastHtml = null;
  element.innerHTML = safeItems.slice(0, batchSize).map(mapper).join("");
  afterRender(element);

  let offset = batchSize;
  const appendNextBatch = () => {
    if (element.__accessFlowRenderToken !== token) {
      return;
    }
    const chunk = safeItems.slice(offset, offset + batchSize);
    if (!chunk.length) {
      return;
    }
    const template = document.createElement("template");
    template.innerHTML = chunk.map(mapper).join("");
    afterRender(template.content);
    element.append(template.content);
    offset += batchSize;
    if (offset < safeItems.length) {
      element.__accessFlowIdleHandle = scheduleIdle(appendNextBatch);
    }
  };

  if (offset < safeItems.length) {
    element.__accessFlowIdleHandle = scheduleIdle(appendNextBatch);
  }
}

export function debounceAsync(callback, waitMs = 300) {
  let timer = 0;
  let controller = null;

  return (...args) => {
    if (timer) {
      window.clearTimeout(timer);
    }
    if (controller) {
      controller.abort();
    }
    controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    timer = window.setTimeout(() => {
      timer = 0;
      void callback({ signal: controller?.signal }, ...args);
    }, waitMs);
  };
}
