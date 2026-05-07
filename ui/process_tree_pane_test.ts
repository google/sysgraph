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

import {ActionElement} from './action.js';
import {ActionLayout, Action} from './graph.js';
import {ProcessTreePane} from './process_tree_pane.js';
import {createTestAction, createTestGraph} from './test_utils.js';

async function waitForUpdate(component: ProcessTreePane) {
  await component.updateComplete;
  await new Promise(requestAnimationFrame);
}

describe('ProcessTreePane', () => {
  let component: ProcessTreePane;
  let action1: Action;
  let action2: Action;
  let action3: Action;
  let action4: Action;

  beforeEach(async () => {
    component = new ProcessTreePane();
    component.style.height = '100px';
    document.body.appendChild(component);
    await component.updateComplete;

    action1 = createTestAction({
      id: 1,
      pid: 101,
      depth: 0,
      parentId: 0,
      args: ['action1'],
    });
    action2 = createTestAction({
      id: 2,
      pid: 102,
      parentId: 1,
      depth: 1,
      args: ['action2'],
    });
    action3 = createTestAction({
      id: 3,
      pid: 103,
      parentId: 2,
      depth: 2,
      args: ['action3'],
    });
    action4 = createTestAction({
      id: 4,
      pid: 104,
      parentId: 1,
      depth: 1,
      args: ['action4'],
    });
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  async function setScrollTopAndWait(scrollTop: number) {
    const scrollHost = component.shadowRoot!.querySelector(
      '#scroll-host',
    ) as HTMLElement;
    scrollHost.scrollTop = scrollTop;
    scrollHost.dispatchEvent(new Event('scroll'));
    // wait for requestAnimationFrame in handleScrollEvent
    await new Promise(requestAnimationFrame);
    // wait for lit update
    await component.updateComplete;
  }

  it('should render actions in a tree', async () => {
    component.graph = createTestGraph({
      actions: [action1, action2, action3, action4],
    });
    await waitForUpdate(component);
    const actionElements =
      component.shadowRoot!.querySelectorAll('action-element');
    expect(actionElements.length).toBe(4);

    const wrappers =
      component.shadowRoot!.querySelectorAll('.tree-node-wrapper');
    expect(wrappers.length).toBe(4);

    // Node 1: action-element for action 1, has children 2 and 4 -> has expand button.
    const node1Action = wrappers[0].querySelector('action-element');
    expect((node1Action as ActionElement).action).toBe(action1);
    expect(wrappers[0].querySelector('.expand-button')).not.toBeNull();

    // Node 2: action-element for action 2, has child 3 -> has expand button.
    const node2Action = wrappers[1].querySelector('action-element');
    expect((node2Action as ActionElement).action).toBe(action2);
    expect(wrappers[1].querySelector('.expand-button')).not.toBeNull();

    // Node 3: action-element for action 3, no children -> no expand button, has h-line.
    const node3Action = wrappers[2].querySelector('action-element');
    expect((node3Action as ActionElement).action).toBe(action3);
    expect(wrappers[2].querySelector('.expand-button')).toBeNull();
    expect(wrappers[2].querySelector('.h-line')).not.toBeNull();

    // Node 4: action-element for action 4, no children -> no expand button, has h-line.
    const node4Action = wrappers[3].querySelector('action-element');
    expect((node4Action as ActionElement).action).toBe(action4);
    expect(wrappers[3].querySelector('.expand-button')).toBeNull();
    expect(wrappers[3].querySelector('.h-line')).not.toBeNull();
  });

  it('should collapse and expand nodes', async () => {
    component.graph = createTestGraph({
      actions: [action1, action2, action3, action4],
    });
    await waitForUpdate(component);
    expect(
      component.shadowRoot!.querySelectorAll('action-element').length,
    ).toBe(4);

    // wrapper 1 corresponds to node 2, which is action2.
    const wrappers =
      component.shadowRoot!.querySelectorAll('.tree-node-wrapper');
    const node2Expand = wrappers[1].querySelector(
      '.expand-button',
    ) as HTMLElement;
    expect(node2Expand).not.toBeNull();

    // Collapse node 2
    node2Expand.click();
    await waitForUpdate(component);

    // Node 3 (child of 2) should be hidden.
    let actionElements =
      component.shadowRoot!.querySelectorAll<ActionElement>('action-element');
    expect(actionElements.length).toBe(3);
    expect(actionElements[0].action).toBe(action1);
    expect(actionElements[1].action).toBe(action2);
    expect(actionElements[2].action).toBe(action4);

    // Expand node 2
    node2Expand.click();
    await waitForUpdate(component);
    actionElements =
      component.shadowRoot!.querySelectorAll<ActionElement>('action-element');
    expect(actionElements.length).toBe(4);
  });

  it('show method should scroll to action and expand parents', async () => {
    component.graph = createTestGraph({
      actions: [action1, action2, action3, action4],
    });
    await waitForUpdate(component);

    const wrappers =
      component.shadowRoot!.querySelectorAll('.tree-node-wrapper');
    const node2Expand = wrappers[1].querySelector(
      '.expand-button',
    ) as HTMLElement;
    // collapse node 2
    node2Expand.click();
    await waitForUpdate(component);
    expect(
      component.shadowRoot!.querySelectorAll('action-element').length,
    ).toBe(3);

    const scrollHost =
      component.shadowRoot!.querySelector<HTMLElement>('#scroll-host')!;
    const spy = spyOn(scrollHost, 'scrollTo');

    component.show(3);
    await waitForUpdate(component);

    // node 2 should be expanded now, so node 3 is visible.
    expect(
      component.shadowRoot!.querySelectorAll('action-element').length,
    ).toBe(4);

    expect(spy).toHaveBeenCalledTimes(1);
    const action3Layout = component.actionLayouts.get(3)!;
    expect(action3Layout.top).toBeGreaterThanOrEqual(0);
    expect((spy.calls.mostRecent().args[0] as ScrollToOptions).top).toEqual(
      action3Layout.top - 100,
    );
  });

  it('should maintain scroll position relative to anchor on view update', async () => {
    // Add a dummy action to force the total height to be large enough
    // (ends at 500px with the mocked layout below) so that we can scroll to 125px.
    const dummyAction = createTestAction({id: 999, pid: 999, args: ['dummy']});
    component.graph = createTestGraph({
      actions: [action1, dummyAction],
    });
    await waitForUpdate(component);

    const scrollHost = component.shadowRoot!.querySelector(
      '#scroll-host',
    ) as HTMLElement;

    // Setup initial layout: Action 1 at top 100, height 100.
    // Dummy action at 400, height 100 (total height 500).
    let layouts = new Map<number, ActionLayout>([
      [1, {top: 100, height: 100}],
      [999, {top: 400, height: 100}],
    ]);

    const calculateLayoutSpy = spyOn(component, 'calculateLayout').and.callFake(
      () => {
        component.actionLayouts = layouts;
      },
    );

    component.updateView();
    await component.updateComplete;

    // Simulate previous scroll position
    await setScrollTopAndWait(125);

    // Simulate update
    // Action 1 moves to top 200, height 200.
    layouts = new Map<number, ActionLayout>([
      [1, {top: 200, height: 200}],
      [999, {top: 500, height: 100}],
    ]);
    calculateLayoutSpy.and.callFake(() => {
      component.actionLayouts = layouts;
    });

    component.updateView();
    await component.updateComplete;

    // Expected: 200 + 0.25 * 200 = 250
    expect(scrollHost.scrollTop).toBe(250);
  });
});
