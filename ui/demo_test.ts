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

import {main} from './demo.js';
import {FileListPane} from './file_list_pane.js';
import {Graph} from './graph.js';
import {PlaygroundApp} from './playground_app.js';
import {createTestAction, createTestGraph} from './test_utils.js';

/**
 * Creates the expected placeholder elements for the demo application.
 */
async function createDocumentSkeleton() {
  const playgroundApp = new PlaygroundApp();
  playgroundApp.style.width = '1200px';
  playgroundApp.style.height = '800px';
  document.body.appendChild(playgroundApp);
  await playgroundApp.updateComplete;
}

describe('main', () => {
  let playgroundApp: PlaygroundApp;
  let originalBody: HTMLBodyElement;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    originalBody = document.body.cloneNode(true) as HTMLBodyElement;

    // Spy on window.fetch
    fetchSpy = spyOn(window, 'fetch');
  });

  afterEach(() => {
    document.body.replaceWith(originalBody);
  });

  it('should exit if playground-app element is missing', async () => {
    await main('gs://bucket/object', null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should show error if no path parameter is in URL', async () => {
    await createDocumentSkeleton();
    playgroundApp = document.querySelector('playground-app')!;
    await main(null, null);

    expect(playgroundApp.loading).toBeFalse();
    expect(playgroundApp.errorMessage).toBe('No sysgraph path specified.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should show error if Graph.fromPath throws due to fetch failure', async () => {
    await createDocumentSkeleton();
    playgroundApp = document.querySelector('playground-app')!;
    fetchSpy.and.resolveTo(
      new Response('Not Found', {status: 404, statusText: 'Not Found'}),
    );

    await main('gs://bucket/object', null);

    expect(playgroundApp.loading).toBeFalse();
    expect(playgroundApp.errorMessage).toBe(
      'Error loading sysgraph: Error: HTTP 404 - Not Found',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle empty graph response from Graph.fromPath', async () => {
    await createDocumentSkeleton();
    playgroundApp = document.querySelector('playground-app')!;

    // Mock Graph.fromPath to return a default Graph instance
    const mockGraph = createTestGraph({});
    spyOn(Graph, 'fromPath').and.resolveTo(mockGraph);

    await main('gs://bucket/object', null);

    expect(Graph.fromPath).toHaveBeenCalledWith('gs://bucket/object');
  });

  it('should select action from aid URL parameter', async () => {
    await createDocumentSkeleton();
    playgroundApp = document.querySelector('playground-app')!;

    const action = createTestAction({
      id: 1,
      pid: 100,
      fileReadIds: [0],
      fileWriteIds: [1],
    });
    const mockGraph = createTestGraph({
      actions: [action],
      files: ['file0.txt', 'file1.txt'],
    });

    spyOn(Graph, 'fromPath').and.resolveTo(mockGraph);

    await main('gs://bucket/object', '1');
    await playgroundApp.updateComplete;
    await playgroundApp.processListPane.updateComplete;
    await playgroundApp.processTreePane.updateComplete;
    // Wait for elements rendered by process-list-pane to update.
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
    await playgroundApp.processListPane.updateComplete;
    await playgroundApp.processTreePane.updateComplete;

    const processesElement = playgroundApp.processListPane;
    const actionElement =
      processesElement.shadowRoot!.querySelector('action-element');
    expect(actionElement).not.toBeNull();
    await actionElement!.updateComplete;
    expect(actionElement!.dataset['id']).toBe('1');
    expect(actionElement!.hasAttribute('is-selected')).toBeTrue();

    const inputsElement = playgroundApp.shadowRoot!.querySelector(
      '#inputs',
    ) as FileListPane;
    await inputsElement.updateComplete;
    expect(inputsElement.files).toEqual(['file0.txt']);
    const outputsElement = playgroundApp.shadowRoot!.querySelector(
      '#outputs',
    ) as FileListPane;
    await outputsElement.updateComplete;
    expect(outputsElement.files).toEqual(['file1.txt']);
  });
});
