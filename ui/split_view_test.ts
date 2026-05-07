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

import {PaneView} from './pane.js';
import {SplitView} from './split_view.js';

async function wait(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getPanelSizes(component: SplitView): number[] {
  const panels = component.shadowRoot!.querySelectorAll('.panel-wrapper');
  return Array.from(panels, (panel) => {
    const flexBasis = (panel as HTMLElement).style.flexBasis;
    const size = Number(flexBasis.replace('%', ''));
    if (isNaN(size)) {
      throw new Error(`Could not parse flexBasis: ${flexBasis}`);
    }
    return size;
  });
}

describe('SplitView', () => {
  let splitView: SplitView | null = null;

  async function createSplitView(
    innerHTML: string,
    height?: string,
  ): Promise<SplitView> {
    const component = new SplitView();
    if (height) {
      component.style.height = height;
    }
    component.innerHTML = innerHTML;
    document.body.appendChild(component);
    await component.updateComplete;
    // wait for slotchange and resize observer
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
    await component.updateComplete;
    splitView = component;
    return component;
  }

  afterEach(() => {
    if (splitView && splitView.parentNode) {
      document.body.removeChild(splitView);
      splitView = null;
    }
  });

  it('should initialize with equal sizes for open panes', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20); // for async stuff in splitview
    await component.updateComplete;

    expect(getPanelSizes(component).length).toBe(2);
    expect(getPanelSizes(component)[0]).toBeCloseTo(50, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(50, 1);
  });

  it('should have n-1 gutters for n panes', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
      <pane-view title="Pane 3" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20);
    await component.updateComplete;
    const gutters = component.shadowRoot!.querySelectorAll('.gutter');
    expect(gutters.length).toBe(2);
  });

  it('should hide gutter if pane is closed', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2"></pane-view>
      <pane-view title="Pane 3" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    const pane2 = component.children[1] as PaneView;
    pane2.open = false;
    await component.updateComplete;
    await wait(20);
    await component.updateComplete;

    const gutters = component.shadowRoot!.querySelectorAll('.gutter');
    // gutters[0] is after pane1, pane1 is open -> gutter shown
    // pane2 is closed, so no gutter should be shown after pane2
    // in split_view2 logic, showGutter depends on pane i being open.
    // if pane-1 is open, gutter-1 is rendered.
    // if pane-2 is NOT open, gutter-2 is NOT rendered.
    // panel-0 open=true, panel-1 open=false, panel-2 open=true
    // children are pane-view.
    // sizes.map((size, i) => ... showGutter = i < this.sizes.length - 1 && this.isPanelOpen(i);
    // i=0: pane-1, open=true, showGutter=true
    // i=1: pane-2, open=false, showGutter=false
    // i=2: pane-3, i=2 == length-1 == 2, showGutter=false
    // only one gutter after pane-1 should be shown.
    expect(gutters.length).toBe(1);
  });

  it('should resize panes when pane is closed and opened', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20);
    await component.updateComplete;

    expect(getPanelSizes(component)[0]).toBeCloseTo(50, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(50, 1);

    const pane2 = component.children[1] as PaneView;
    pane2
      .shadowRoot!.querySelector('.header')!
      .dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await wait(20);
    await component.updateComplete;

    expect(pane2.open).toBeFalse();
    expect(getPanelSizes(component)[1]).toBeCloseTo(2.8, 1);
    expect(getPanelSizes(component)[0]).toBeCloseTo(97.2, 1);

    // Open pane2 again
    pane2
      .shadowRoot!.querySelector('.header')!
      .dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await wait(20);
    await component.updateComplete;

    expect(pane2.open).toBeTrue();
    expect(getPanelSizes(component)[0]).toBeCloseTo(50, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(50, 1);
  });

  it('should maximize pane size if it is the only one being opened', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20);
    await component.updateComplete;

    expect(getPanelSizes(component)[0]).toBeCloseTo(50, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(50, 1);

    const pane1 = component.children[0] as PaneView;
    const pane2 = component.children[1] as PaneView;

    // Close pane1
    pane1
      .shadowRoot!.querySelector('.header')!
      .dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await wait(20);
    await component.updateComplete;
    expect(pane1.open).toBeFalse();
    expect(getPanelSizes(component)[0]).toBeCloseTo(2.8, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(97.2, 1);

    // Close pane2
    pane2
      .shadowRoot!.querySelector('.header')!
      .dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await wait(20);
    await component.updateComplete;
    expect(pane2.open).toBeFalse();
    expect(getPanelSizes(component)[0]).toBeCloseTo(2.8, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(2.8, 1);

    // Open pane1 - it should be maximized
    pane1
      .shadowRoot!.querySelector('.header')!
      .dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await wait(20);
    await component.updateComplete;
    expect(pane1.open).toBeTrue();
    expect(getPanelSizes(component)[0]).toBeCloseTo(97.2, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(2.8, 1);
  });

  it('should resize panes on gutter drag', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20);
    await component.updateComplete;

    const gutter = component.shadowRoot!.querySelector('.gutter')!;
    const gutterRect = gutter.getBoundingClientRect();

    gutter.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: gutterRect.left + 2,
        clientY: gutterRect.top + 100,
        bubbles: true,
        composed: true,
      }),
    );
    await wait(20);
    await component.updateComplete;

    // Drag 100px to right, pane 0 grows, pane 1 shrinks.
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: gutterRect.left + 2 + 100,
        clientY: gutterRect.top + 100,
      }),
    );
    await wait(20);
    await component.updateComplete;

    // 100px is 10% of 1000px width.
    // Pane 0 should be 50+10=60%, pane 1 50-10=40%.
    expect(getPanelSizes(component)[0]).toBeCloseTo(60, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(40, 1);

    window.dispatchEvent(new PointerEvent('pointerup', {}));
    await wait(20);
    await component.updateComplete;
    expect(component.isResizing).toBeFalse();
  });

  it('should resize panes on gutter drag left', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20);
    await component.updateComplete;

    const gutter = component.shadowRoot!.querySelector('.gutter')!;
    const gutterRect = gutter.getBoundingClientRect();

    gutter.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: gutterRect.left + 2,
        clientY: gutterRect.top + 100,
        bubbles: true,
        composed: true,
      }),
    );
    await wait(20);
    await component.updateComplete;

    // Drag 100px to left, pane 0 shrinks, pane 1 grows.
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: gutterRect.left + 2 - 100,
        clientY: gutterRect.top + 100,
      }),
    );
    await wait(20);
    await component.updateComplete;

    // 100px is 10% of 1000px width.
    // Pane 0 should be 50-10=40%, pane 1 50+10=60%.
    expect(getPanelSizes(component)[0]).toBeCloseTo(40, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(60, 1);

    window.dispatchEvent(new PointerEvent('pointerup', {}));
    await wait(20);
    await component.updateComplete;
    expect(component.isResizing).toBeFalse();
  });

  it('should respect minSize on gutter drag', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '600px',
    );
    component.style.width = '1000px';
    await wait(20);
    await component.updateComplete;

    const gutter = component.shadowRoot!.querySelector('.gutter')!;
    const gutterRect = gutter.getBoundingClientRect();

    gutter.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: gutterRect.left + 2,
        clientY: gutterRect.top + 100,
        bubbles: true,
        composed: true,
      }),
    );
    await wait(20);
    await component.updateComplete;

    // Drag 450px to right. Pane 1 wants 50+45=95%, pane 2 wants 50-45=5%.
    // Pane 2 min size is 100px=10%.
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: gutterRect.left + 2 + 450,
        clientY: gutterRect.top + 100,
      }),
    );
    await wait(20);
    await component.updateComplete;

    expect(getPanelSizes(component)[0]).toBeCloseTo(90, 1);
    expect(getPanelSizes(component)[1]).toBeCloseTo(10, 1);

    window.dispatchEvent(new PointerEvent('pointerup', {}));
    await wait(20);
    await component.updateComplete;
  });

  it('should enable scrolling if container is too small for minSize', async () => {
    const component = await createSplitView(
      `
      <pane-view title="Pane 1" open></pane-view>
      <pane-view title="Pane 2" open></pane-view>
    `,
      '150px',
    );
    component.direction = 'vertical';
    component.minSize = 100;
    await wait(20);
    await component.updateComplete;
    await wait(20);
    await component.updateComplete;

    // 2 panes * 100px minSize = 200px.
    // Container height is 150px, so we need scrolling.
    // The internal container should have min-height="200px".
    const container = component.shadowRoot!.querySelector(
      '.container',
    ) as HTMLElement;
    expect(container.style.minHeight).toBe('200px');
    expect(component.scrollHeight).toBeGreaterThan(component.clientHeight);
  });
});
