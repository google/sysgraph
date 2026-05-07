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

import {SettingsPane} from './settings_pane.js';

describe('SettingsPane', () => {
  let component: SettingsPane;

  beforeEach(async () => {
    component = new SettingsPane();
    component.allPaneIds = ['pane-1', 'pane-2', 'pane-3', 'pane-4'];
    component.columns = [['pane-1', 'pane-2'], ['pane-3']];
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should render initial columns and panes', () => {
    const columns = component.shadowRoot!.querySelectorAll('.column');
    expect(columns.length).toBe(3); // 2 visible + 1 hidden
    const pane1 = columns[0].querySelector('[data-pane-id="pane-1"]');
    expect(pane1).not.toBeNull();
    expect(pane1!.textContent).toContain('Pane 1');
    expect(pane1!.querySelector('.remove-button')).not.toBeNull();
    const pane2 = columns[0].querySelector('[data-pane-id="pane-2"]');
    expect(pane2).not.toBeNull();
    expect(pane2!.textContent).toContain('Pane 2');
    expect(pane2!.querySelector('.remove-button')).not.toBeNull();
    const pane3 = columns[1].querySelector('[data-pane-id="pane-3"]');
    expect(pane3).not.toBeNull();
    expect(pane3!.textContent).toContain('Pane 3');
    expect(pane3!.querySelector('.remove-button')).not.toBeNull();
    const hiddenColumn = columns[2];
    expect(hiddenColumn.classList.contains('hidden-column')).toBeTrue();
    const pane4 = hiddenColumn.querySelector('[data-pane-id="pane-4"]');
    expect(pane4).not.toBeNull();
    expect(pane4!.textContent).toContain('Pane 4');
    expect(pane4!.querySelector('.remove-button')).toBeNull();
  });

  it('should add a column', async () => {
    const addButton = component.shadowRoot!.querySelector(
      '.controls button',
    ) as HTMLElement;
    addButton.click();
    await component.updateComplete;
    expect(component.columns.length).toBe(3);
    expect(component.columns[2]).toEqual([]);
    const columns = component.shadowRoot!.querySelectorAll('.column');
    expect(columns.length).toBe(4); // 3 visible + 1 hidden
  });

  it('should remove a column and move its panes to hidden', async () => {
    const columnsChangedSpy = jasmine.createSpy('columns-changed');
    component.addEventListener('columns-changed', columnsChangedSpy);
    const removeButton = component.shadowRoot!.querySelector(
      '.column:nth-child(1) .remove-button',
    ) as HTMLElement;
    removeButton.click();
    await component.updateComplete;
    expect(component.columns.length).toBe(1);
    expect(component.columns[0]).toEqual(['pane-3']);
    expect(component.hiddenPanes).toEqual(['pane-1', 'pane-2', 'pane-4']);
    expect(columnsChangedSpy).toHaveBeenCalledTimes(1);
  });

  it('should remove a pane and move it to hidden', async () => {
    const columnsChangedSpy = jasmine.createSpy('columns-changed');
    component.addEventListener('columns-changed', columnsChangedSpy);
    const removeButton = component.shadowRoot!.querySelector(
      '.pane-item[data-pane-id="pane-1"] .remove-button',
    ) as HTMLElement;
    removeButton.click();
    await component.updateComplete;
    expect(component.columns).toEqual([['pane-2'], ['pane-3']]);
    expect(component.hiddenPanes).toEqual(['pane-1', 'pane-4']);
    expect(columnsChangedSpy).toHaveBeenCalledTimes(1);
  });

  it('should dispatch layout-reset event on reset button click', async () => {
    const resetSpy = jasmine.createSpy('layout-reset');
    component.addEventListener('layout-reset', resetSpy);
    const resetButton = component.shadowRoot!.querySelector(
      '.controls button:nth-child(2)',
    ) as HTMLElement;
    resetButton.click();
    await component.updateComplete;
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('should render display option checkboxes', () => {
    const checkboxes = component.shadowRoot!.querySelectorAll(
      '.display-controls input[type="checkbox"]',
    );
    expect(checkboxes.length).toBe(8);
  });

  it('should dispatch display-options-changed event on change', async () => {
    const displayOptionsSpy = jasmine.createSpy('display-options-changed');
    component.addEventListener('display-options-changed', displayOptionsSpy);
    const pidCheckbox = component.shadowRoot!.querySelector(
      'input[name="pid"]',
    ) as HTMLInputElement;
    pidCheckbox.click();
    await component.updateComplete;

    expect(displayOptionsSpy).toHaveBeenCalledTimes(1);
    const event = displayOptionsSpy.calls.mostRecent().args[0] as CustomEvent;
    expect(event.detail.displayOptions.pid).toBeFalse();
  });

  it('should render sample process preview', () => {
    const previewContainer =
      component.shadowRoot!.querySelector('.preview-container');
    expect(previewContainer).not.toBeNull();
    const actionElement = previewContainer!.querySelector('action-element');
    expect(actionElement).not.toBeNull();
  });

  describe('Drag and Drop', () => {
    it('should move a pane between columns', async () => {
      const columnsChangedSpy = jasmine.createSpy('columns-changed');
      component.addEventListener('columns-changed', columnsChangedSpy);

      const pane1 = component.shadowRoot!.querySelector(
        '[data-pane-id="pane-1"]',
      ) as HTMLElement;
      const column1 = component.shadowRoot!.querySelectorAll('.column')[1];

      const dt = new DataTransfer();
      pane1.dispatchEvent(
        new DragEvent('dragstart', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await component.updateComplete;
      column1.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      column1.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;

      expect(columnsChangedSpy).toHaveBeenCalledTimes(1);
      expect(component.columns).toEqual([['pane-2'], ['pane-1', 'pane-3']]);
    });

    it('should reorder a pane within the same column', async () => {
      const columnsChangedSpy = jasmine.createSpy('columns-changed');
      component.addEventListener('columns-changed', columnsChangedSpy);

      const pane2 = component.shadowRoot!.querySelector(
        '[data-pane-id="pane-2"]',
      ) as HTMLElement;
      const pane1Div = component.shadowRoot!.querySelector(
        'div[draggable=true][data-pane-id="pane-1"]',
      )!.parentElement!;

      const dt = new DataTransfer();
      pane2.dispatchEvent(
        new DragEvent('dragstart', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await component.updateComplete;
      pane1Div.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      pane1Div.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      expect(columnsChangedSpy).toHaveBeenCalledTimes(1);
      expect(component.columns).toEqual([['pane-2', 'pane-1'], ['pane-3']]);
    });

    it('should not change order when dropping a pane on itself', async () => {
      const columnsChangedSpy = jasmine.createSpy('columns-changed');
      component.addEventListener('columns-changed', columnsChangedSpy);
      const pane1 = component.shadowRoot!.querySelector(
        '[data-pane-id="pane-1"]',
      ) as HTMLElement;
      const pane2Div = component.shadowRoot!.querySelector(
        'div[draggable=true][data-pane-id="pane-2"]',
      )!.parentElement!;

      const dt = new DataTransfer();
      pane1.dispatchEvent(
        new DragEvent('dragstart', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await component.updateComplete;
      pane2Div.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      pane2Div.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      expect(columnsChangedSpy).not.toHaveBeenCalled();
      expect(component.columns).toEqual([['pane-1', 'pane-2'], ['pane-3']]);
    });

    it('should move a pane to the hidden column', async () => {
      const pane1 = component.shadowRoot!.querySelector(
        '[data-pane-id="pane-1"]',
      ) as HTMLElement;
      const hiddenColumn = component.shadowRoot!.querySelectorAll('.column')[2];
      const dt = new DataTransfer();
      pane1.dispatchEvent(
        new DragEvent('dragstart', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await component.updateComplete;
      hiddenColumn.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      hiddenColumn.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      expect(component.columns).toEqual([['pane-2'], ['pane-3']]);
      expect(component.hiddenPanes).toEqual(['pane-1', 'pane-4']);
    });

    it('should move a pane from hidden to a visible column', async () => {
      const pane4 = component.shadowRoot!.querySelector(
        '[data-pane-id="pane-4"]',
      ) as HTMLElement;
      const column0 = component.shadowRoot!.querySelectorAll('.column')[0];
      const dt = new DataTransfer();
      pane4.dispatchEvent(
        new DragEvent('dragstart', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await component.updateComplete;
      column0.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      column0.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      expect(component.columns).toEqual([
        ['pane-4', 'pane-1', 'pane-2'],
        ['pane-3'],
      ]);
      expect(component.hiddenPanes).toEqual([]);
    });

    it('should move a column', async () => {
      const column0Header = component.shadowRoot!.querySelector(
        '.column:nth-child(1) .column-header',
      ) as HTMLElement;
      const column1 = component.shadowRoot!.querySelectorAll('.column')[1];
      const dt = new DataTransfer();
      column0Header.dispatchEvent(
        new DragEvent('dragstart', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await component.updateComplete;
      column1.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      column1.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          composed: true,
        }),
      );
      await component.updateComplete;
      expect(component.columns).toEqual([['pane-3'], ['pane-1', 'pane-2']]);
    });
  });
});
