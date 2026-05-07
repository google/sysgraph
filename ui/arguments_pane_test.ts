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

import {ArgumentsPane} from './arguments_pane.js';

describe('ArgumentsPane', () => {
  let component: ArgumentsPane;

  beforeEach(async () => {
    component = new ArgumentsPane();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should render title and 0 count for empty args array', async () => {
    component.args = [];
    await component.updateComplete;

    const argElements = component.shadowRoot!.querySelectorAll('.arg');
    expect(argElements.length).toBe(0);
  });

  it('should render args and count', async () => {
    component.args = ['arg1', 'arg2'];
    await component.updateComplete;

    const argElements = component.shadowRoot!.querySelectorAll('.arg');
    expect(argElements.length).toBe(2);
    expect(argElements[0].textContent).toBe('arg1');
    expect(argElements[1].textContent).toBe('arg2');
  });
});
