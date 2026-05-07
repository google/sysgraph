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

describe('PaneView', () => {
  let component: PaneView;

  beforeEach(async () => {
    component = new PaneView();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should render title', async () => {
    component.paneTitle = 'Test Pane';
    await component.updateComplete;
    const title = component.shadowRoot!.querySelector('.title-text');
    expect(title!.textContent).toBe('Test Pane');
  });

  it('should be closed by default', () => {
    expect(component.open).toBeFalse();
    const content = component.shadowRoot!.querySelector(
      '.content',
    ) as HTMLElement;
    expect(getComputedStyle(content).display).toBe('none');
  });

  it('should be open if initialized with open=true', async () => {
    const openComponent = new PaneView();
    openComponent.open = true;
    document.body.appendChild(openComponent);
    await openComponent.updateComplete;

    expect(openComponent.open).toBeTrue();
    const content = openComponent.shadowRoot!.querySelector(
      '.content',
    ) as HTMLElement;
    expect(getComputedStyle(content).display).not.toBe('none');

    document.body.removeChild(openComponent);
  });

  it('should open when header is clicked', async () => {
    const header = component.shadowRoot!.querySelector(
      '.header',
    ) as HTMLElement;
    header.click();
    await component.updateComplete;
    expect(component.open).toBeTrue();
    const content = component.shadowRoot!.querySelector(
      '.content',
    ) as HTMLElement;
    expect(getComputedStyle(content).display).not.toBe('none');
  });

  it('should dispatch pane-toggle event on click', async () => {
    const spy = jasmine.createSpy('pane-toggle');
    component.addEventListener('pane-toggle', spy);
    const header = component.shadowRoot!.querySelector(
      '.header',
    ) as HTMLElement;
    header.click();
    await component.updateComplete;
    expect(spy).toHaveBeenCalled();
    const event = spy.calls.mostRecent().args[0] as CustomEvent;
    expect(event.detail.open).toBeTrue();
  });

  it('should not toggle if not collapsible', async () => {
    component.collapsible = false;
    await component.updateComplete;
    const header = component.shadowRoot!.querySelector(
      '.header',
    ) as HTMLElement;
    header.click();
    await component.updateComplete;
    expect(component.open).toBeFalse();
  });

  it('should hide chevron if not collapsible', async () => {
    component.collapsible = false;
    await component.updateComplete;
    const chevron = component.shadowRoot!.querySelector('.chevron');
    expect(chevron).toBeNull();
  });

  it('should render default slot content', async () => {
    component.open = true;
    const slottedEl = document.createElement('p');
    slottedEl.textContent = 'Default';
    component.appendChild(slottedEl);
    await component.updateComplete;

    const slot = component.shadowRoot!.querySelector(
      '.content > slot:not([name])',
    ) as HTMLSlotElement;
    expect(slot.assignedElements()[0]).toBe(slottedEl);
  });

  it('should render header slot content', async () => {
    const slottedEl = document.createElement('span');
    slottedEl.slot = 'header';
    slottedEl.textContent = 'Header';
    component.appendChild(slottedEl);
    await component.updateComplete;

    const slot = component.shadowRoot!.querySelector(
      '.header > slot[name="header"]',
    ) as HTMLSlotElement;
    expect(slot.assignedElements()[0]).toBe(slottedEl);
  });
});
