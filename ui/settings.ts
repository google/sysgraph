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

/**
 * @fileoverview Settings and layout persistence for the playground app.
 */

import {ActionDisplayOptions, defaultActionDisplayOptions} from './action.js';

/**
 * Enum for pane identifiers.
 */
export enum PaneId {
  SEARCH = 'search',
  PROCESS_LIST = 'process-list',
  PROCESS_TREE = 'process-tree',
  ANCESTRY = 'ancestry',
  PIPELINE = 'pipeline',
  INPUTS = 'inputs',
  OUTPUTS = 'outputs',
  ARGUMENTS = 'arguments',
  ANALYSIS = 'analysis',
  HISTOGRAM = 'histogram',
}

/**
 * The default column configuration for the playground app.
 */
export const DEFAULT_COLUMNS: PaneId[][] = [
  [PaneId.SEARCH, PaneId.PROCESS_LIST, PaneId.PROCESS_TREE],
  [
    PaneId.ANCESTRY,
    PaneId.PIPELINE,
    PaneId.INPUTS,
    PaneId.OUTPUTS,
    PaneId.ARGUMENTS,
  ],
  [PaneId.ANALYSIS, PaneId.HISTOGRAM],
];

const SETTINGS_KEY = 'playground-layout-settings';
const SETTINGS_VERSION = 1;

/**
 * Interface for storing and loading the playground's layout settings.
 * These settings are persisted in local storage.
 */
export declare interface LayoutSettings {
  version: number;
  columns: PaneId[][];
  actionDisplayOptions: ActionDisplayOptions;
}

/**
 * Loads layout settings from local storage.
 */
export function loadLayoutSettings(): LayoutSettings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const settings = JSON.parse(stored) as LayoutSettings;
      if (settings.version === SETTINGS_VERSION && settings.columns) {
        const validPaneIds = new Set(Object.values(PaneId));
        for (const column of settings.columns) {
          if (column.length === 0) {
            return {
              version: SETTINGS_VERSION,
              columns: DEFAULT_COLUMNS,
              actionDisplayOptions: defaultActionDisplayOptions,
            };
          }
          for (const paneId of column) {
            if (!validPaneIds.has(paneId)) {
              return {
                version: SETTINGS_VERSION,
                columns: DEFAULT_COLUMNS,
                actionDisplayOptions: defaultActionDisplayOptions,
              };
            }
          }
        }
        return {
          ...settings,
          actionDisplayOptions:
            settings.actionDisplayOptions ?? defaultActionDisplayOptions,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load layout settings:', e);
    window.localStorage.removeItem(SETTINGS_KEY);
  }
  return {
    version: SETTINGS_VERSION,
    columns: DEFAULT_COLUMNS,
    actionDisplayOptions: defaultActionDisplayOptions,
  };
}

/**
 * Saves layout settings to local storage.
 */
export function saveLayoutSettings(
  columns: PaneId[][],
  actionDisplayOptions: ActionDisplayOptions,
) {
  try {
    const settings: LayoutSettings = {
      version: SETTINGS_VERSION,
      columns,
      actionDisplayOptions,
    };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save layout settings:', e);
  }
}
