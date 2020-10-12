/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Dialog from '/extlib/dialog.js';

import {
  configs,
  log
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import { Message } from '/common/Message.js';
import { Redmine } from '/common/Redmine.js';
import * as Migration from './migration.js';

Dialog.setLogger(log);

configs.$loaded.then(() => {
  Migration.migrateConfigs();
});

const mProjectItemIds = new Set();

const MENU_COMMON_PARAMS = {
  contexts: ['message_list']
};
const SUBMENU_COMMON_PARAMS = {
  ...MENU_COMMON_PARAMS,
  parentId: 'redmine',
  async shouldVisible(info, tab, message) {
    return !!(message && MENU_ITEMS.redmine.shouldEnable(info, tab)); // eslint-disable-line no-use-before-define
  }
};
const MENU_ITEMS = {
  redmine: {
    ...MENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_redmine_label'),
    async shouldEnable(info, _tab, _message) {
      const accountId = info.selectedFolder && info.selectedFolder.accountId;
      const accountInfo = configs.accounts[accountId];
      return !!(accountInfo && accountInfo.url && accountInfo.key);
    }
  },
  openWebUI: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_openWebUI_label')
  },
  linkToIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_linkToIssue_label'),
    async shouldEnable(info, _tab, message) {
      const accountId = info.selectedFolder && info.selectedFolder.accountId;
      return !!(message && message.getProjectId({ accountId }));
    }
  },
  createIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_createIssue_label')
  },
  updateIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_updateIssue_label')
  },
  openIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_openIssue_label'),
    async shouldEnable(info, _tab, _message) {
      return !!(await getContextIssueId(info));
    }
  },

  mappedProject: {
    ...MENU_COMMON_PARAMS,
    contexts: ['folder_pane'],
    title: browser.i18n.getMessage('menu_mappedProject_label'),
    shouldVisible: null,
    async shouldEnable(info, _tab, _message) {
      const accountId = info.selectedFolder && info.selectedFolder.accountId;
      const accountInfo = configs.accounts[accountId];
      return !!(accountInfo && accountInfo.url && accountInfo.key && mProjectItemIds.size > 0);
    }
  }
};

async function getContextIssueId(info) {
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  return (
    messages &&
    messages.length > 0 &&
    messages[0].getIssueId()
  ) || null;
}

for (const [id, item] of Object.entries(MENU_ITEMS)) {
  item.id = id;
  item.lastEnabled = true;
  item.lastVisible = true;
  item.params = {
    id,
    parentId: item.parentId,
    contexts: item.contexts,
    title:    item.title
  };
  browser.menus.create(item.params);
}

browser.menus.onShown.addListener(async (info, tab) => {
  const accountId = info.selectedFolder && info.selectedFolder.accountId;
  const redmine = new Redmine({ accountId });
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  const message = messages && messages.length > 0 ? messages[0] : null;

  let modificationCount = 0;
  const tasks = [];
  for (const [id, item] of Object.entries(MENU_ITEMS)) {
    tasks.push((async () => {
      const [enabled, visible] = await Promise.all([
        typeof item.shouldEnable == 'function' ? item.shouldEnable(info, tab, message) : true,
        typeof item.shouldVisible == 'function' ? item.shouldVisible(info, tab, message) : true
      ]);
      browser.menus.update(id, {
        enabled,
        visible
      });
      /* eslint-disable no-unused-expressions */
      (item.lastEnabled != enabled) && (item.lastEnabled = enabled, modificationCount++);
      (item.lastVisible != visible) && (item.lastVisible = visible, modificationCount++);
      /* eslint-enable no-unused-expressions */
    })());
  }

  if (info.contexts.includes('folder_pane') &&
      info.selectedFolder) {
    modificationCount++;
    tasks.push(redmine.getProjects().catch(_error => []).then(async projects => {
      if (projects.length == 0)
        return;

      const creatings = [];
      const mappedFolders = configs.accountMappedFolders[accountId] || {};
      const projectId = mappedFolders[info.selectedFolder.path];

      mProjectItemIds.add('map-to-project:');
      creatings.push(browser.menus.create({
        id:       'map-to-project:',
        parentId: 'mappedProject',
        title:    browser.i18n.getMessage('menu_mappedProject_unmapped_label'),
        contexts: ['folder_pane'],
        type:     'radio',
        checked:  !projectId
      }));
      mProjectItemIds.add('map-to-project-separator');
      creatings.push(browser.menus.create({
        id:       'map-to-project-separator',
        parentId: 'mappedProject',
        contexts: ['folder_pane'],
        type:     'separator'
      }));

      for (const project of projects) {
        const id = `map-to-project:${project.id}`;
        mProjectItemIds.add(id);
        creatings.push(browser.menus.create({
          id,
          parentId: 'mappedProject',
          title:    project.fullname,
          contexts: ['folder_pane'],
          type:     'radio',
          checked:  project.id == projectId
        }));
      }
      await Promise.all(creatings);
      browser.menus.update('mappedProject', {
        enabled: true
      });
      MENU_ITEMS.mappedProject.lastEnabled = true;
      browser.menus.refresh();
    }));
  }

  await Promise.all(tasks);

  if (modificationCount > 0)
    browser.menus.refresh();
});

browser.menus.onHidden.addListener(async (_info, _tab) => {
  if (mProjectItemIds.size > 0) {
    for (const id of mProjectItemIds) {
      browser.menus.remove(id);
    }
    mProjectItemIds.clear();
    browser.menus.update('mappedProject', {
      enabled: false
    });
    MENU_ITEMS.mappedProject.lastEnabled = false;
    browser.menus.refresh();
  }
});

browser.menus.onClicked.addListener(async (info, tab) => {
  const accountId = info.selectedFolder && info.selectedFolder.accountId;
  const redmine = new Redmine({ accountId });
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  const message = messages && messages.length ? messages[0] : null;
  switch (info.menuItemId) {
    case 'openWebUI': {
      if (!message)
        return;
      const url = await redmine.getCreationURL(message);
      browser.tabs.create({
        windowId: tab.windowId,
        active:   true,
        url
      });
    }; break;

    case 'linkToIssue':
      if (!message)
        return;
      runTask(async () => linkToIssue(message, { tab, accountId }));
      break;

    case 'createIssue':
      if (!message)
        return;
      runTask(async () => createIssue(message, { tab, accountId }));
      break;

    case 'updateIssue':
      if (!message)
        return;
      runTask(async () => updateIssue(message, { tab, accountId }));
      break;

    case 'openIssue': {
      if (!message)
        return;
      const issueId = await getContextIssueId(info);
      if (!issueId)
        return;
      const url = await redmine.getIssueURL(issueId, { withAPIKey: true });
      browser.tabs.create({
        windowId: tab.windowId,
        active:   true,
        url
      });
    }; break;

    default:
      if (/^map-to-project:(.*)$/.test(info.menuItemId) &&
          info.selectedFolder) {
        const projectId = RegExp.$1 || null;
        const accountMappedFolders = JSON.parse(JSON.stringify(configs.accountMappedFolders));
        const mappedFolders = accountMappedFolders[accountId] || {};
        if (projectId)
          mappedFolders[info.selectedFolder.path] = projectId;
        else
          delete mappedFolders[info.selectedFolder.path];
        accountMappedFolders[accountId] = mappedFolders;
        configs.accountMappedFolders = accountMappedFolders;
      }
      break;
  }
});


async function linkToIssue(message, { tab, accountId } = {}) {
  try {
    const dialogParams = {
      url:    '/dialog/link-to-issue/link-to-issue.html',
      modal:  !configs.debug,
      opener: await browser.windows.get(tab.windowId),
      width:  configs.linkToIssueDialogWidth,
      height: configs.linkToIssueDialogHeight
    };
    if (typeof configs.linkToIssueDialogLeft == 'number')
      dialogParams.left = configs.linkToIssueDialogLeft;
    if (typeof configs.linkToIssueDialogTop == 'number')
      dialogParams.top = configs.linkToIssueDialogTop;
    try {
      const result = await Dialog.open(
        dialogParams,
        { accountId,
          defaultId: await message.getIssueId(),
          projectId: message.getProjectId() }
      );
      const issue = result && result.detail;
      log('chosen issue: ', issue);
      if (issue)
        await message.setIssueId(issue.id);
    }
    catch(_error) {
    }
  }
  catch(error) {
    console.error(error);
  }
}

async function createIssue(message, { tab, accountId } = {}) {
  const dialogParams = {
    url:    '/dialog/create-issue/create-issue.html',
    modal:  !configs.debug,
    opener: await browser.windows.get(tab.windowId),
    width:  configs.createIssueDialogWidth,
    height: configs.createIssueDialogHeight
  };
  if (typeof configs.createIssueDialogLeft == 'number')
    dialogParams.left = configs.createIssueDialogLeft;
  if (typeof configs.createIssueDialogTop == 'number')
    dialogParams.top = configs.createIssueDialogTop;
  try {
    await Dialog.open(
      dialogParams,
      { accountId,
        message: message.raw }
    );
  }
  catch(_error) {
  }
}

async function updateIssue(message, { tab, accountId } = {}) {
  if (!(await message.getIssueId())) {
    await linkToIssue(message, tab);
    if (!(await message.getIssueId()))
      return;
  }

  const dialogParams = {
    url:    '/dialog/update-issue/update-issue.html',
    modal:  !configs.debug,
    opener: await browser.windows.get(tab.windowId),
    width:  configs.updateIssueDialogWidth,
    height: configs.updateIssueDialogHeight
  };
  if (typeof configs.updateIssueDialogLeft == 'number')
    dialogParams.left = configs.updateIssueDialogLeft;
  if (typeof configs.updateIssueDialogTop == 'number')
    dialogParams.top = configs.updateIssueDialogTop;
  try {
    await Dialog.open(
      dialogParams,
      { accountId,
        message: message.raw }
    );
  }
  catch(_error) {
  }
}


let mInProgressTask;

async function runTask(asyncTask) {
  if (mInProgressTask) {
    browser.runtime.sendMessage({
      type: Constants.TYPE_NOTIFY_MULTIPLE_DIALOGS_REQUESTED
    });
    return;
  }

  mInProgressTask = asyncTask();
  try {
    await mInProgressTask;
  }
  catch(_error) {
  }
  mInProgressTask = null;
}
