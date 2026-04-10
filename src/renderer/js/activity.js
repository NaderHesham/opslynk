const ACTIVITY_IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const ACTIVITY_CHECK_INTERVAL_MS = 1000;

let activityTrackerStarted = false;
let activityState = 'active';
let lastInputAt = Date.now();
let lastStateChangeAt = Date.now();
let activityIntervalId = null;

function getActivitySnapshot() {
  return {
    state: activityState,
    lastInputAt,
    lastStateChangeAt,
    idleThresholdMs: ACTIVITY_IDLE_THRESHOLD_MS
  };
}

function reportActivity(transitionType = null, at = Date.now()) {
  if (!IPC?.reportActivity) return;
  const payload = {
    activity: getActivitySnapshot()
  };
  if (transitionType) {
    payload.transition = {
      type: transitionType,
      at
    };
  }
  IPC.reportActivity(payload).catch(err => {
    console.error('[OpsLynk][activity-report]', err);
  });
}

function setActivityState(nextState, at = Date.now(), shouldReport = true) {
  if (activityState === nextState) return;
  activityState = nextState;
  lastStateChangeAt = at;
  if (nextState === 'active') lastInputAt = at;
  if (shouldReport) reportActivity(nextState, at);
}

function markUserInput() {
  const now = Date.now();
  lastInputAt = now;
  if (activityState === 'idle') {
    setActivityState('active', now, true);
  }
}

function checkIdleState() {
  const now = Date.now();
  if (activityState === 'active' && now - lastInputAt >= ACTIVITY_IDLE_THRESHOLD_MS) {
    setActivityState('idle', now, true);
  }
}

function startActivityTracking() {
  if (activityTrackerStarted) return;
  activityTrackerStarted = true;

  const passive = { passive: true };
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'].forEach(eventName => {
    window.addEventListener(eventName, markUserInput, passive);
  });
  window.addEventListener('focus', markUserInput);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markUserInput();
  });

  activityIntervalId = window.setInterval(checkIdleState, ACTIVITY_CHECK_INTERVAL_MS);
  reportActivity(null, Date.now());
}
