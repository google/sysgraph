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

import {VirtualScrollbar} from './virtual_scrollbar.js';

describe('VirtualScrollbar', () => {
  let component: VirtualScrollbar;

  beforeEach(async () => {
    component = new VirtualScrollbar();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should not render thumb if contentHeight <= viewportHeight', async () => {
    component.contentHeight = 100;
    component.viewportHeight = 100;
    await component.updateComplete;

    const thumb = component.shadowRoot!.querySelector('.thumb');
    expect(thumb).toBeNull();
  });

  it('should calculate thumb height correctly', async () => {
    component.contentHeight = 1000;
    component.viewportHeight = 100;
    component.minThumbHeight = 10;
    await component.updateComplete;

    // thumb height = max(10, 100*100/1000) = max(10, 10) = 10
    let thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb).not.toBeNull();
    expect(thumb.style.height).toBe('10px');

    component.minThumbHeight = 5;
    await component.updateComplete;
    // thumb height = max(5, 10) = 10
    thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.height).toBe('10px');

    component.contentHeight = 500;
    component.viewportHeight = 100;
    component.minThumbHeight = 30;
    await component.updateComplete;
    // thumb height = 100*100/500 = 20. max(30, 20) = 30
    thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.height).toBe('30px');
  });

  it('should calculate thumb position correctly', async () => {
    component.contentHeight = 1000;
    component.viewportHeight = 100;
    component.minThumbHeight = 10;
    component.virtualScrollTop = 0;
    await component.updateComplete;
    // thumb height is 10px.
    // thumbTop = (virtualScrollTop * (100 - 10)) / (1000 - 100) = virtualScrollTop * 90 / 900 = virtualScrollTop / 10

    let thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.top).toBe('0px');

    component.virtualScrollTop = 500;
    await component.updateComplete;
    thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.top).toBe('50px');

    component.virtualScrollTop = 900;
    await component.updateComplete;
    thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.top).toBe('90px');
  });

  it('should dispatch scroll-to event on track click', async () => {
    component.contentHeight = 1000;
    component.viewportHeight = 100;
    component.minThumbHeight = 10;
    component.virtualScrollTop = 450;
    await component.updateComplete;

    const scrollSpy = jasmine.createSpy('scroll-to');
    component.addEventListener('scroll-to', scrollSpy);

    // Clicking at offsetY=10 should move thumb middle to 10, so thumb top to 10 - 10/2 = 5.
    // targetThumbTop = 5
    // trackClickRange = 100 - 10 = 90
    // newScrollTop = 5 * (1000-100) / 90 = 5 * 900 / 90 = 50
    const event = new PointerEvent('pointerdown', {button: 0});
    Object.defineProperty(event, 'target', {value: component});
    Object.defineProperty(event, 'offsetY', {value: 10});
    component.dispatchEvent(event);

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.calls.mostRecent().args[0].detail.scrollTop).toBeCloseTo(
      50,
    );
  });

  it('should dispatch scroll-to event on thumb drag', async () => {
    component.contentHeight = 1000;
    component.viewportHeight = 100;
    component.minThumbHeight = 10;
    component.virtualScrollTop = 0;
    await component.updateComplete;

    const scrollSpy = jasmine.createSpy('scroll-to');
    component.addEventListener('scroll-to', scrollSpy);

    const thumb = component.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(
      new PointerEvent('pointerdown', {
        button: 0,
        clientY: 0,
        bubbles: true,
        composed: true,
      }),
    );
    await component.updateComplete;

    component.ownerDocument.dispatchEvent(
      new PointerEvent('pointermove', {clientY: 10}),
    );
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.calls.mostRecent().args[0].detail.scrollTop).toBe(100);

    component.ownerDocument.dispatchEvent(new PointerEvent('pointerup', {}));
  });

  it('should render indicators at correct positions', async () => {
    component.contentHeight = 1000;
    component.viewportHeight = 100;
    component.indicatorTops = [0, 500, 1000];
    await component.updateComplete;

    const indicators = component.shadowRoot!.querySelectorAll('.indicator');
    expect(indicators.length).toBe(3);

    expect((indicators[0] as HTMLElement).style.top).toBe('-2px');
    expect((indicators[1] as HTMLElement).style.top).toBe('48px');
    expect((indicators[2] as HTMLElement).style.top).toBe('98px');
  });
});
