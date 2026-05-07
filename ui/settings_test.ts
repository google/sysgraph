/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {ActionDisplayOptions, defaultActionDisplayOptions} from './action.js';
import {
  DEFAULT_COLUMNS,
  loadLayoutSettings,
  PaneId,
  saveLayoutSettings,
} from './settings.js';

const SETTINGS_KEY = 'playground-layout-settings';

describe('Settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('loadLayoutSettings should return default columns if no settings are stored', () => {
    expect(loadLayoutSettings()).toEqual({
      version: 1,
      columns: DEFAULT_COLUMNS,
      actionDisplayOptions: defaultActionDisplayOptions,
    });
  });

  it('saveLayoutSettings and loadLayoutSettings should persist and retrieve settings', () => {
    const customColumns: PaneId[][] = [[PaneId.ANALYSIS], [PaneId.SEARCH]];
    const customOptions: ActionDisplayOptions = {
      ...defaultActionDisplayOptions,
      pid: false,
      aid: true,
    };
    saveLayoutSettings(customColumns, customOptions);
    expect(loadLayoutSettings()).toEqual({
      version: 1,
      columns: customColumns,
      actionDisplayOptions: customOptions,
    });
  });

  it('loadLayoutSettings should return default columns if stored data is invalid JSON', () => {
    window.localStorage.setItem(SETTINGS_KEY, 'invalid-json');
    expect(loadLayoutSettings()).toEqual({
      version: 1,
      columns: DEFAULT_COLUMNS,
      actionDisplayOptions: defaultActionDisplayOptions,
    });
  });

  it('loadLayoutSettings should return default columns if version mismatch', () => {
    const oldSettings = {version: 0, columns: [[PaneId.ANALYSIS]]};
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(oldSettings));
    expect(loadLayoutSettings()).toEqual({
      version: 1,
      columns: DEFAULT_COLUMNS,
      actionDisplayOptions: defaultActionDisplayOptions,
    });
  });

  it('loadLayoutSettings should return default columns if any pane ID is invalid', () => {
    const columnsWithInvalid = [
      [PaneId.SEARCH, 'invalid-pane'],
      [PaneId.PROCESS_LIST],
    ];
    const settings = {version: 1, columns: columnsWithInvalid};
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    expect(loadLayoutSettings()).toEqual({
      version: 1,
      columns: DEFAULT_COLUMNS,
      actionDisplayOptions: defaultActionDisplayOptions,
    });
  });

  it('loadLayoutSettings should return default columns if any column is empty', () => {
    const settings = {version: 1, columns: [[PaneId.SEARCH], []]};
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    expect(loadLayoutSettings()).toEqual({
      version: 1,
      columns: DEFAULT_COLUMNS,
      actionDisplayOptions: defaultActionDisplayOptions,
    });
  });
});
