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

import {FileListPane} from './file_list_pane.js';

describe('FileListPane', () => {
  let component: FileListPane;

  beforeEach(async () => {
    component = new FileListPane();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should render title and 0 count for empty files array', async () => {
    component.paneTitle = 'Inputs';
    component.files = [];
    await component.updateComplete;

    const fileElements = component.shadowRoot!.querySelectorAll('.file');
    expect(fileElements.length).toBe(0);
  });

  it('should render files and count', async () => {
    component.paneTitle = 'Outputs';
    component.files = ['file0.txt', 'file2.dat'];
    await component.updateComplete;

    const fileElements = component.shadowRoot!.querySelectorAll('.file');
    expect(fileElements.length).toBe(2);
    expect(fileElements[0].textContent).toBe('file0.txt');
    expect(fileElements[1].textContent).toBe('file2.dat');
  });
});
