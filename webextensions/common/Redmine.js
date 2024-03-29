/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  log
} from './common.js';
import * as Constants from './constants.js';
import * as Cache from './cache.js';

export class Redmine {
  constructor({ accountId, url, key }) {
    this._accountId = accountId;
    this.__url = url;
    this.__key = key;
  }

  get accountId() {
    return this.shouldInheritDefaultAccount ? configs.defaultAccount : this._accountId;
  }
  get accountInfo() {
    return this.shouldInheritDefaultAccount ? this.defaultAccountInfo : this.privateAccountInfo;
  }
  get privateAccountInfo() {
    return (configs.accounts || {})[this._accountId] || {};
  }
  get defaultAccountInfo() {
    return (configs.accounts || {})[configs.defaultAccount] || {};
  }
  get shouldInheritDefaultAccount() {
    const accountInfo = this.privateAccountInfo;
    return (
      accountInfo.inheritDefaultAccount !== false &&
      this._accountId != configs.defaultAccount &&
      configs.defaultAccount
    );
  }
  get mappedFolders() {
    return (
      this.shouldInheritDefaultAccount ?
        configs.accountMappedFoldersDiverted[this._accountId] :
        configs.accountMappedFolders[this._accountId]
    ) || {};
  }
  set mappedFolders(mappings) {
    if (this.shouldInheritDefaultAccount)
      configs.accountMappedFoldersDiverted[this._accountId] = mappings;
    else
      configs.accountMappedFolders[this._accountId] = mappings;
    return mappings;
  }

  get _url() {
    return (this.__url || this.accountInfo.url || '').trim();
  }

  get _key() {
    return (this.__key || this.accountInfo.key || '').trim();
  }


  _getURL(path = '', params = {}) {
    if (!this._url)
      throw new Error(`Missing Redmine URL: you need to configure it at first for the account ${this.accountId}`);
    const queryParams = new URLSearchParams();
    for (const name in params) {
      queryParams.set(name, params[name]);
    }
    return `${this._url.replace(/\/$/, '')}/${path.replace(/^\//, '')}${Object.keys(params).length > 0 ? '?' : ''}${queryParams.toString()}`;
  }

  async _request({ method, path, params, data, type, response } = {}) {
    if (!method)
      method = 'GET';
    log('request:', method, path);

    if (!type)
      type = 'application/json';

    const url = this._getURL(path, {
      ...(params || {}),
      ...(method == 'GET' && data !== undefined ? data : {}),
      key: this._key
    });

    let body = '';
    if (method != 'GET' && data !== undefined) {
      switch (type) {
        case 'application/json':
          body = JSON.stringify(data);
          break;
        case 'application/octet-stream':
          body = data;
          break;
        default:
          throw new Error('undefined content-type');
      }
    }

    if (configs.dryRun && method != 'GET') {
      return response || {};
    }

    const options = {
      method: method || 'GET',
      mode:   'cors',
      headers: {
        'Content-Type': type,
      },
    };
    if (body)
      options.body = body;

    const rawResponse = await fetch(url, options);
    log('result:', rawResponse.ok);
    if (!rawResponse.ok)
      throw new Error(`${rawResponse.status} ${rawResponse.statusText}`);

    const responseBody = await rawResponse.text();
    log('responseBody: ', responseBody);
    return responseBody && JSON.parse(responseBody);
  }

  getIssueURL(id, { withAPIKey } = {}) {
    return this._getURL(
      `/issues/${id}`,
      withAPIKey ? { key: this._key } : {}
    );
  }

  getProjectURL(id, { withAPIKey } = {}) {
    return this._getURL(
      `/projects/${id}`,
      withAPIKey ? { key: this._key } : {}
    );
  }

  async getCreationURL(message) {
    const allParams = await message.toRedmineParams();
    const params = {
      'issue[subject]':     allParams.subject,
      'issue[description]': allParams.description
    };
    if (allParams.project_id)
      return this._getURL(`/projects/${allParams.project_id}/issues/new`, params);
    else
      return this._getURL(`/issues/new`, params);
  }

  async ping() {
    // REST APIの対応可否やバージョンチェックをした方がいい
    return this._request({
      path: '/users/current.json'
    })
      .then(() => true)
      .catch(error => {
        log(`Redmine.ping for ${this.accountId}: ` + String(error));
        return false;
      });
  }

  async _upload(file) {
    const data = file.data || await file.promisedData;
    log('upload:', file.name, data.byteLength, this.accountId);
    const result = await this._request({
      method: 'POST',
      path:   'uploads.json',
      type:   'application/octet-stream',
      data,
      response: { upload: { token: '' } }
    }).catch(_error => null);
    return {
      token:        result && result.upload.token,
      filename:     file.name,
      content_type: file.contentType,
      description:  ''
    };
  }

  async createIssue(issue) {
    log('create:', issue, this.accountId);
    try {
      const files = issue.files;
      delete issue.files;
      if (files)
        issue.uploads = await Promise.all(files.map(file => this._upload(file)));
      return this._request({
        method: 'POST',
        path:   'issues.json',
        data:   { issue },
        response: { issue: { id: 0, ...issue } }
      });
    }
    catch(error) {
      log(`Redmine.create for ${this.accountId}: ` + String(error));
      return {};
    }
  }

  async updateIssue(issue) {
    log('update:', issue, this.accountId);
    try {
      const files = issue.files;
      delete issue.files;
      if (files)
        issue.uploads = await Promise.all(files.map(file => this._upload(file)));
      const result = await this._request({
        method: 'PUT',
        path:   `issues/${issue.id}.json`,
        data:   { issue },
        response: { issue }
      });
      //Cache.remove(`redmine:issue:${issue.id}`);
      return result;
    }
    catch(error) {
      log(`Redmine.update for ${this.accountId}: ` + String(error));
      throw error;
    }
  }

  async getIssue(id, params = {}) {
    log('issue:', id, this.accountId, params);
    try {
      const response = await Cache.getAndFallback(
        `redmine[${this.accountId}]:issue:${id}`,
        () => {
          return this._request({
            path: `issues/${id}.json`,
            params
          });
        }
      );
      return response && response.issue || {};
    }
    catch(error) {
      log(`Redmine.issue for ${this.accountId}: ` + String(error));
      return {};
    }
  }

  async getIssues(projectId, { offset, limit } = {}) {
    log('issues:', projectId, this.accountId, offset, limit);
    try {
      const response = await Cache.getAndFallback(
        `redmine[${this.accountId}]:issues:${projectId}:${offset}-${limit}`,
        () => {
          return this._request({
            path: `projects/${projectId}/issues.json`,
            data: { offset, limit }
          });
        }
      );
      return response.issues;
    }
    catch(error) {
      log(`Redmine.issues for ${this.accountId}: ` + String(error));
      return [];
    }
  }


  async getRelations(issueId /* { offset, limit } = {} */) {
    log('relations:', issueId, this.accountId /*, offset, limit */);
    try {
      const response = await Cache.getAndFallback(
        `redmine[${this.accountId}]:relations:${issueId /* }:${offset}-${limit} */}`,
        () => {
          return this._request({
            path: `issues/${issueId}/relations.json` /*,
            data: { offset, limit } */
          });
        }
      );
      return response.relations;
    }
    catch(error) {
      log(`Redmine.relations for ${this.accountId}: ` + String(error));
      return [];
    }
  }

  async saveRelation(relation) {
    log('save relation:', relation, this.accountId);
    try {
      const data = {
        relation: {
          issue_to_id   : parseInt(relation.issue_to_id),
          relation_type : relation.relation_type,
          ...('delay' in relation ? { delay: relation.delay } : {})
        }
      };
      if (relation.id)
        await this.deleteRelation(relation.id);
      return this._request({
        method: 'POST',
        path:   `issues/${relation.issue_id}/relations.json`,
        data,
        response: {}
      });
    }
    catch(error) {
      log(`Redmine.saveRelation for ${this.accountId}: ` + String(error));
      return {};
    }
  }

  async deleteRelation(relationId) {
    log('delete relation:', relationId, this.accountId);
    try {
      return this._request({
        method: 'DELETE',
        path:   `relations/${relationId}.json`,
        response: {}
      });
    }
    catch(error) {
      log(`Redmine.deleteRelation for ${this.accountId}: ` + String(error));
      return {};
    }
  }

  async getMyself() {
    log('myself ', this.accountId);
    const response = await Cache.getAndFallback(
      `redmine[${this.accountId}]:myself`,
      () => {
        return this._request({ path: 'users/current.json' });
      }
    );
    return response.user;
  }

  async getProject(projectId) {
    log('project:', projectId, this.accountId);
    const response = await Cache.getAndFallback(
      `redmine[${this.accountId}]:project:${projectId}`,
      () => {
        return this._request({
          path: `projects/${projectId}.json`,
          data: { include: 'trackers' }
        });
      }
    );
    return response.project;
  }

  async getProjects({ all, visibilityMode, visibleProjects, hiddenProjects } = {}) {
    log('projects ', this.accountId);
    const projects = await Cache.getAndFallback(
      `redmine[${this.accountId}]:projects`,
      async () => {
        const projects = [];
        const projectsById = {};
        let offset = 0;
        let response;
        do {
          const limit = response && response.limit || 25;
          response = await this._request({
            path: 'projects.json',
            data: { offset, limit }
          });
          if (!response.projects)
            break;
          for (const project of response.projects) {
            projectsById[project.id] = project;
          }
          projects.push(...response.projects);
          offset += limit;
        } while (response.offset + response.limit <= response.total_count);
        for (const project of projects) {
          const names = this._getNestedProjectNames(project, projectsById);
          project.fullName = names.join('/');
          project.indentedName = names.length > 1 ?
            `${names.slice(0, names.length - 1).map(() => '\u00A0').join('\u00A0')}\u00A0»\u00A0${names[names.length - 1]}` :
            names[0];
        }
        return projects.sort((a, b) => (a.fullName > b.fullName) ? 1 : -1 );
      }
    );

    visibleProjects = new Set((visibleProjects || configs.accountVisibleProjects[this.accountId] || []).map(project => String(project)));
    hiddenProjects = new Set((hiddenProjects || configs.accountHiddenProjects[this.accountId] || []).map(project => String(project)));
    const accountInfo = this.accountInfo;
    if (!visibilityMode)
      visibilityMode = accountInfo.projectsVisibilityMode || configs.projectsVisibilityMode;
    const showByDefault = visibilityMode != Constants.PROJECTS_VISIBILITY_HIDE_BY_DEFAULT;
    return projects.filter(project => {
      const projectId = String(project.id);
      const shouldShow = showByDefault ?
        (!hiddenProjects.has(projectId) && !hiddenProjects.has(project.identifier)) :
        (visibleProjects.has(projectId) || visibleProjects.has(project.identifier));
      if (!all && !shouldShow)
        return false;
      project.visible = shouldShow;
      return true;
    });
  }
  _getNestedProjectNames(project, projectsById) {
    const parent = project.parent || projectsById[project.id]?.parent;
    if (parent)
      return [...this._getNestedProjectNames(parent, projectsById), project.name];
    return [project.name];
  }

  async getFirstProject() {
    const projects = await this.getProjects();
    return projects.length > 0 ? projects[0] : null;
  }

  async getMembers(projectId) {
    log('members:', projectId, this.accountId);
    //取得(権限の関係で例外が飛びやすい)
    try {
      const response = await Cache.getAndFallback(
        `redmine[${this.accountId}]:members:${projectId}`,
        () => {
          return this._request({
            path: `projects/${projectId}/memberships.json`
          });
        }
      );
      return response.memberships;
    }
    catch(error) {
      log(`Redmine.members for ${this.accountId}: ` + String(error));
      //気休めに自分自身を返す
      const myself = await this.getMyself();
      myself.name = myself.lastname;
      return [{ user: myself }];
    }
  }

  async getVersions(projectId) {
    log('versions:', projectId, this.accountId);
    return Cache.getAndFallback(
      `redmine[${this.accountId}]:version:${projectId}`,
      async () => {
        const response = await this._request({
          path: `projects/${projectId}/versions.json`
        });
        const versions = response.versions;
        return versions.filter(version => version.status === 'open');
      }
    );
  }

  async getTrackers(projectId) {
    if (projectId) {
      log(`trackers (project=${projectId})`, this.accountId);
      return (await this.getProject(projectId)).trackers || [];
    }
    else {
      log('trackers ');
      const response = await Cache.getAndFallback(
        `redmine[${this.accountId}]:trackers`,
        () => {
          return this._request({
            path: 'trackers.json'
          });
        }
      );
      return response.trackers;
    }
  }

  async getIssueStatuses({ all, visibilityMode, visibleStatuses } = {}) {
    log('issueStatuses ', this.accountId);
    const response = await Cache.getAndFallback(
      `redmine[${this.accountId}]:issueStatuses`,
      () => {
        return this._request({
          path: 'issue_statuses.json'
        });
      }
    );
    visibleStatuses = new Set((visibleStatuses || configs.accountVisibleStatuses[this.accountId] || []).map(status => String(status)));
    const accountInfo = this.accountInfo;
    if (!visibilityMode)
      visibilityMode = accountInfo.statusesVisibilityMode || configs.statusesVisibilityMode;
    const showByDefault = visibilityMode != Constants.STATUSES_VISIBILITY_HIDE_BY_DEFAULT;
    const statuses = response.issue_statuses.filter(status =>
      (all || showByDefault) ? true :
        (visibleStatuses.has(String(status.id)) || visibleStatuses.has(status.name))
    );
    return statuses;
  }

  async saveTimeEntry(timeEntry) {
    log('save timeEntry:', timeEntry, this.accountId);
    try {
      const data = {
        time_entry: {
          issue_id    : parseInt(timeEntry.issue_id),
          activity_id : parseInt(timeEntry.activity_id),
          hours       : String(timeEntry.hours),
          comments    : String(timeEntry.comments),
        }
      };
      return this._request({
        method: 'POST',
        path:   `time_entries.json`,
        data,
        response: {}
      });
    }
    catch(error) {
      log(`Redmine.timeEntry for ${this.accountId}: ` + String(error));
      return {};
    }
  }

  async getTimeEntryActivities() {
    log('timeEntryActivities ', this.accountId);
    const response = await Cache.getAndFallback(
      `redmine[${this.accountId}]:timeEntryActivities`,
      () => {
        return this._request({
          path:     'enumerations/time_entry_activities.json',
          response: {
            'time_entry_activities':[]
          }
        });
      }
    );
    return response.time_entry_activities;
  }

  async getCustomFields() {
    log('customFields ', this.accountId);

    if (this.accountInfo.customFields) {
      const fields = JSON.parse(this.accountInfo.customFields || '[]');
      if (!Array.isArray(fields) && fields.custom_fields)
        return fields.custom_fields;
      return fields;
    }

    return Cache.getAndFallback(
      'redmine:customFields',
      async () => {
        const response = await this._request({ path: 'custom_fields.json' }).catch(error => {
          console.log('failed to fetch custom fields definition: ', error);
          return null;
        });
        return response &&
          response.custom_fields &&
          response.custom_fields.filter(field => {
            return field.customized_type == 'issue' && field.visible;
          });
      }
    );
  }

  recache() {
    log('recache ', this.accountId);
    if (this.accountId)
      Cache.removeAll(new RegExp(`^redmine\\[${this.accountId}\\]:`));
    else
      Cache.removeAll(/^redmine(\[[^\]+])?:/);
  }
};
