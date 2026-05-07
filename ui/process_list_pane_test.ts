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

import {Action, ActionLayout, Graph} from './graph.js';
import {ProcessListPane} from './process_list_pane.js';
import {createTestAction, createTestGraph} from './test_utils.js';
import {VirtualScrollbar} from './virtual_scrollbar.js';

function createTestGraphWithActions(numActions: number): Graph {
  const actions: Action[] = [];
  for (let i = 0; i < numActions; i++) {
    actions.push(
      createTestAction({id: i, pid: 100 + i, args: [`action_${i}`]}),
    );
  }
  const graph = createTestGraph({
    actions,
  });
  return graph;
}

describe('ProcessListPane', () => {
  let component: ProcessListPane;

  beforeEach(async () => {
    component = new ProcessListPane();
    component.style.height = '100px';
    document.body.appendChild(component);
    await component.updateComplete;
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

  it('should render actions', async () => {
    component.graph = createTestGraphWithActions(2);
    await component.updateComplete;
    await component.updateComplete;
    const actionElements =
      component.shadowRoot!.querySelectorAll('action-element');
    expect(actionElements.length).toBe(2);
  });

  it('show method should scroll to the action', async () => {
    component.graph = createTestGraphWithActions(10);
    await component.updateComplete;

    const scrollableParent = component.shadowRoot!.querySelector(
      '#scroll-host',
    ) as HTMLElement;
    const spy = spyOn(scrollableParent, 'scrollTo');

    component.show(5);
    expect(spy).toHaveBeenCalledTimes(1);
    const action5Layout = component.actionLayouts.get(5)!;
    expect(action5Layout.top).toBeGreaterThanOrEqual(0);
    expect((spy.calls.mostRecent().args[0] as ScrollToOptions).top).toEqual(
      action5Layout.top - 100,
    );
  });

  describe('calcVisibleActions', () => {
    beforeEach(async () => {
      component.graph = createTestGraphWithActions(200);
      await component.updateComplete;
    });

    it('should only render visible actions when scrolled to top', async () => {
      await setScrollTopAndWait(0);
      const actionElements =
        component.shadowRoot!.querySelectorAll('action-element');
      expect(actionElements.length).toBeLessThan(100);
      expect(actionElements.length).toBeGreaterThan(40);
      expect(Number(actionElements[0].action!.id)).toBe(0);
      expect(
        Number(actionElements[actionElements.length - 1].action!.id),
      ).toBeGreaterThan(40);
      expect(
        Number(actionElements[actionElements.length - 1].action!.id),
      ).toBeLessThan(70);
    });

    it('should only render visible actions when scrolled to middle', async () => {
      const action100Layout = component.actionLayouts.get(100)!;
      await setScrollTopAndWait(action100Layout.top);

      const actionElements =
        component.shadowRoot!.querySelectorAll('action-element');
      expect(actionElements.length).toBeLessThan(150);
      expect(actionElements.length).toBeGreaterThan(80);
      const firstId = Number(actionElements[0].action!.id);
      const lastId = Number(
        actionElements[actionElements.length - 1].action!.id,
      );
      expect(firstId).toBeGreaterThan(30);
      expect(firstId).toBeLessThan(70);
      expect(lastId).toBeGreaterThan(130);
      expect(lastId).toBeLessThan(170);
    });

    it('should only render visible actions when scrolled to bottom', async () => {
      const lastActionLayout = component.actionLayouts.get(199)!;
      await setScrollTopAndWait(lastActionLayout.top);

      const actionElements =
        component.shadowRoot!.querySelectorAll('action-element');
      expect(actionElements.length).toBeLessThan(100);
      expect(actionElements.length).toBeGreaterThan(30);
      const firstId = Number(actionElements[0].action!.id);
      expect(firstId).toBeGreaterThan(130);
      expect(firstId).toBeLessThan(170);
      expect(Number(actionElements[actionElements.length - 1].action!.id)).toBe(
        199,
      );
    });
  });

  it('should update scrollbar on view update', async () => {
    component.graph = createTestGraphWithActions(40);
    await component.updateComplete;

    await setScrollTopAndWait(100);

    component.updateView();
    await component.updateComplete;

    const scrollbar = component.shadowRoot!.querySelector(
      'virtual-scrollbar',
    )! as VirtualScrollbar;
    expect(scrollbar.virtualScrollTop).toBe(100);
  });

  it('should maintain scroll position relative to anchor on view update', async () => {
    component.graph = createTestGraphWithActions(10);
    await component.updateComplete;

    const scrollHost = component.shadowRoot!.querySelector(
      '#scroll-host',
    ) as HTMLElement;

    // Setup initial layout: All actions 100px height. Total 1000px.
    let layouts = new Map<number, ActionLayout>();
    for (let i = 0; i < 10; i++) {
      layouts.set(i, {top: i * 100, height: 100});
    }

    // Mock calculateLayout to use our controlled layouts
    spyOn(component, 'calculateLayout').and.callFake(() => {
      component.actionLayouts = layouts;
    });

    // Apply initial layout
    component.updateView();
    await component.updateComplete;

    // Scroll to middle of action 5 (top 500). 550. Ratio 0.5.
    await setScrollTopAndWait(550);

    // Simulate resize/update where heights change
    // New layout: Actions 0-4 grew to 200px each. Action 5 starts at 1000.
    layouts = new Map<number, ActionLayout>();
    for (let i = 0; i < 5; i++) {
      layouts.set(i, {top: i * 200, height: 200});
    }
    // Action 5 shrunk to 50px.
    layouts.set(5, {top: 1000, height: 50});
    // Others follow...
    for (let i = 6; i < 10; i++) {
      layouts.set(i, {
        top: 1050 + (i - 6) * 50,
        height: 50,
      });
    }

    component.updateView();
    await component.updateComplete;

    // Expected: newTop + ratio * newHeight = 1000 + 0.5 * 50 = 1025
    expect(scrollHost.scrollTop).toBe(1025);
  });
});
