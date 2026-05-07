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

import {Graph} from './graph.js';
import {PlaygroundApp} from './playground_app.js';

/**
 * Main function for the sysgraph playground.
 */
export async function main(
  pathFromUrl: string | null,
  actionIdFromUrl: string | null,
) {
  const playgroundApp = document.querySelector('playground-app');
  if (!(playgroundApp instanceof PlaygroundApp)) {
    console.error('playground-app element not found');
    return;
  }

  if (!pathFromUrl) {
    playgroundApp.loading = false;
    playgroundApp.errorMessage = 'No sysgraph path specified.';
    return;
  }

  try {
    const graph = await Graph.fromPath(pathFromUrl);
    playgroundApp.graph = graph;
    playgroundApp.loading = false;
    await playgroundApp.updateComplete;
    if (actionIdFromUrl) {
      playgroundApp.applyActionIdFromUrl(actionIdFromUrl);
    }
  } catch (error) {
    console.error(error); // Useful for test failure logs.
    playgroundApp.loading = false;
    playgroundApp.errorMessage = `Error loading sysgraph: ${error}`;
    await playgroundApp.updateComplete;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pathFromUrl = urlParams.get('path');
  const actionIdFromUrl = urlParams.get('aid');
  main(pathFromUrl, actionIdFromUrl);
});
