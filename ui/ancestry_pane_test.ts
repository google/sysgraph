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

import {AncestryPane} from './ancestry_pane.js';
import {createTestAction} from './test_utils.js';

describe('AncestryPane', () => {
  let component: AncestryPane;

  beforeEach(async () => {
    component = new AncestryPane();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should render 0 count if no action is provided', async () => {
    component.actions = [];
    component.selectedActionID = 1;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(0);
  });

  it('should render one action for action with no parent', async () => {
    const action = createTestAction({id: 1, pid: 1001});
    component.actions = [action];
    component.selectedActionID = 1;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(1);
    expect(elements[0].getAttribute('data-id')).toBe('1');
  });

  it('should render ancestors in correct order', async () => {
    const action1 = createTestAction({
      id: 1,
      pid: 1001,
    });
    const action2 = createTestAction({
      id: 2,
      pid: 1002,
      parentId: 1,
    });
    const action3 = createTestAction({
      id: 3,
      pid: 1003,
      parentId: 2,
    });
    component.actions = [action1, action2, action3];
    component.selectedActionID = 3;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(3);
    expect(elements[0].getAttribute('data-id')).toBe('1');
    expect(elements[1].getAttribute('data-id')).toBe('2');
    expect(elements[2].getAttribute('data-id')).toBe('3');
  });
});
