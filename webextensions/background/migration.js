/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs
} from '/common/common.js';

const kCONFIGS_VERSION = 1;

export function migrateConfigs() {
  switch (configs.configsVersion) {
    case 0:
      if (!configs.accounts && configs.account) {
        const accounts = {};
        accounts[configs.account] = {
          url:            configs.redmineURL,
          key:            configs.redmineAPIKey,
          defaultProject: configs.defaultProject,
          defaultTracker: configs.defaultTracker,
          customFields:   configs.customFields
        };
        configs.accounts = accounts;

        const mappedFolders = {};
        mappedFolders[configs.account] = configs.mappedFolders;
        configs.accountMappedFolders = mappedFolders;

        const visibleProjects = {};
        visibleProjects[configs.account] = configs.visibleProjects;
        configs.accountVisibleProjects = visibleProjects;

        const hiddenProjects = {};
        hiddenProjects[configs.account] = configs.hiddenProjects;
        configs.accountHiddenProjects = hiddenProjects;

        const visibleStatuses = {};
        visibleStatuses[configs.account] = configs.visibleStatuses;
        configs.accountVisibleStatuses = visibleStatuses;

        configs.accountVisibleFields = {};
      }
  }
  configs.configsVersion = kCONFIGS_VERSION;
}
