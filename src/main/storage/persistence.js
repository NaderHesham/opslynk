'use strict';

function createPersistence({ storage, state }) {
  function doSaveState() {
    storage.saveState({
      helpRequests: state.helpRequests,
      pendingOutgoingHelpRequests: state.pendingOutgoingHelpRequests,
      userGroups: state.userGroups
    });
  }

  function doSaveHistory() {
    storage.saveHistory(state.chatHistory);
  }

  return { doSaveState, doSaveHistory };
}

module.exports = { createPersistence };

