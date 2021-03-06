/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log
} from './common.js';
import * as Constants from './constants.js';

const mPromisedDB = new Promise((resolve, reject) => {
  const request = window.indexedDB.open(Constants.DB_NAME, Constants.DB_VERSION);
  request.onupgradeneeded = event => {
    const db = event.target.result;
    const objectStore = db.createObjectStore(Constants.STORE_MESSAGE_TO_ISSUE, {
      keyPath: 'messageId'
    });
    objectStore.createIndex('messageToIssue', 'messageId', { unique: true });
  };
  request.onsuccess = event => {
    resolve(event.target.result);
  };
  request.onerror = event => {
    const error = new Error(`Cannot access to the DB: ${event.target.errorCode}`);
    console.error(error);
    reject(error);
  };
});

export async function setMessageToIssueRelation(messageId, issueId) {
  log('setMessageToIssueRelation ', { messageId, issueId });
  const record = { messageId, issueId };
  const db = await mPromisedDB;
  const transaction = db.transaction([Constants.STORE_MESSAGE_TO_ISSUE], 'readwrite');
  return new Promise((resolve, _reject) => {
    const store = transaction.objectStore(Constants.STORE_MESSAGE_TO_ISSUE);
    const request = store.put(record);
    request.onsuccess = _event => {
      log(' => success');
      resolve(true);
    };
    request.onerror = event => {
      log(' => fail ', event);
      resolve(false);
    };
  });
}

export async function getRelatedIssueIdFromMessageId(messageId) {
  log('getRelatedIssueIdFromMessageId ', messageId);
  const db = await mPromisedDB;
  const transaction = db.transaction([Constants.STORE_MESSAGE_TO_ISSUE]);
  return new Promise((resolve, _reject) => {
    const store = transaction.objectStore(Constants.STORE_MESSAGE_TO_ISSUE);
    const request = store.get(messageId);
    request.onsuccess = event => {
      const record = event.target.result;
      log(' => success ', record);
      resolve(record && record.issueId);
    };
    request.onerror = event => {
      log(' => fail ', event);
      resolve(null);
    };
  });
}
