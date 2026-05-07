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

import {ActionSelectedEventDetail} from './action.js';
import {
  HistogramPane,
  HistogramRowClickedEventDetail,
} from './histogram_pane.js';
import {PaneView} from './pane.js';
import {HEADER_CONFIG, HeaderSection, PlaygroundApp} from './playground_app.js';
import {ProcessListPane} from './process_list_pane.js';
import {ProcessTreePane} from './process_tree_pane.js';
import {SearchPane} from './search_pane.js';
import {PaneId} from './settings.js';
import {createTestAction, createTestGraph} from './test_utils.js';

describe('PlaygroundApp', () => {
  let app: PlaygroundApp;

  beforeEach(async () => {
    localStorage.clear();
    app = new PlaygroundApp();
    app.style.height = '600px';
    app.style.width = '1200px';
    document.body.appendChild(app);
    await app.updateComplete;
  });

  afterEach(() => {
    if (app && app.parentNode) {
      document.body.removeChild(app);
    }
  });

  const waitForUpdate = async () => {
    await app.updateComplete;
    await new Promise((resolve) => {
      setTimeout(resolve, 50); // Wait for SplitView async layout
    });
  };

  it('syncs selection from process list to process tree', async () => {
    const action = createTestAction({id: 1, pid: 100});
    app.graph = createTestGraph({actions: [action]});
    await waitForUpdate();

    const processList = app.shadowRoot!.querySelector(
      '#processes',
    ) as ProcessListPane;
    const processTree = app.shadowRoot!.querySelector(
      '#process-tree',
    ) as ProcessTreePane;

    expect(processList).not.toBeNull();
    expect(processTree).not.toBeNull();

    const treeShowSpy = spyOn(processTree, 'show');

    // Simulate action selection in process list
    processList.dispatchEvent(
      new CustomEvent<ActionSelectedEventDetail>('action-selected', {
        detail: {action},
        bubbles: true,
        composed: true,
      }),
    );
    await waitForUpdate();

    expect(app.selectedActionID).toBe(1);
    expect(treeShowSpy).toHaveBeenCalledWith(1);
  });

  it('syncs selection from process tree to process list', async () => {
    const action = createTestAction({id: 2, pid: 102});
    app.graph = createTestGraph({actions: [action]});
    await waitForUpdate();

    const processList = app.shadowRoot!.querySelector(
      '#processes',
    ) as ProcessListPane;
    const processTree = app.shadowRoot!.querySelector(
      '#process-tree',
    ) as ProcessTreePane;

    const listShowSpy = spyOn(processList, 'show');

    // Simulate action selection in process tree
    processTree.dispatchEvent(
      new CustomEvent<ActionSelectedEventDetail>('action-selected', {
        detail: {action},
        bubbles: true,
        composed: true,
      }),
    );
    await waitForUpdate();

    expect(app.selectedActionID).toBe(2);
    expect(listShowSpy).toHaveBeenCalledWith(2);
  });

  it('should update display options when settings-pane dispatches event', async () => {
    app.showSettings = true;
    await waitForUpdate();
    const settingsPane = app.shadowRoot!.querySelector('settings-pane')!;

    expect(app.actionDisplayOptions.aid).toBeFalse();

    settingsPane.dispatchEvent(
      new CustomEvent('display-options-changed', {
        detail: {
          displayOptions: {...app.actionDisplayOptions, aid: true},
        },
        bubbles: true,
        composed: true,
      }),
    );
    await waitForUpdate();

    expect(app.actionDisplayOptions.aid).toBeTrue();
  });

  describe('Header rendering', () => {
    it('should not render header if disabled', async () => {
      app.headerConfig = {...HEADER_CONFIG, enabled: false};
      app.requestUpdate();
      await waitForUpdate();
      const header = app.shadowRoot!.querySelector('.header');
      expect(header).toBeNull();
    });

    it('should render header if enabled', async () => {
      app.headerConfig = {...HEADER_CONFIG, enabled: true};
      app.requestUpdate();
      await waitForUpdate();
      const header = app.shadowRoot!.querySelector('.header');
      expect(header).not.toBeNull();
    });

    it('should render header sections in default order', async () => {
      app.headerConfig = {
        ...HEADER_CONFIG,
        enabled: true,
        sections: [HeaderSection.NAV, HeaderSection.SETTINGS],
      };
      app.requestUpdate();
      await waitForUpdate();
      const header = app.shadowRoot!.querySelector('.header')!;
      const children = Array.from(header.children, (el) => el.className);
      expect(children).toEqual(['header-nav', 'header-version']);
    });

    it('should render header sections in rearranged order', async () => {
      app.headerConfig = {
        ...HEADER_CONFIG,
        enabled: true,
        sections: [HeaderSection.SETTINGS, HeaderSection.NAV],
      };
      app.requestUpdate();
      await waitForUpdate();
      const header = app.shadowRoot!.querySelector('.header')!;
      const children = Array.from(header.children, (el) => el.className);
      expect(children).toEqual(['header-version', 'header-nav']);
    });

    it('should only render specified header sections', async () => {
      app.headerConfig = {
        ...HEADER_CONFIG,
        enabled: true,
        sections: [HeaderSection.NAV],
      };
      app.requestUpdate();
      await waitForUpdate();
      const header = app.shadowRoot!.querySelector('.header')!;
      const children = Array.from(header.children, (el) => el.className);
      expect(children).toEqual(['header-nav']);
      expect(
        app.shadowRoot!.querySelector('.header-display-controls'),
      ).toBeNull();
      // Since SETTINGS section is not included, it should be null.
      expect(app.shadowRoot!.querySelector('.header-version')).toBeNull();
    });
  });

  describe('Column rendering', () => {
    it('should render columns based on default column config', async () => {
      app.graph = createTestGraph({actions: []});
      await waitForUpdate();
      await waitForUpdate(); // Wait for nested SplitView updates

      expect(app.columns.length).toBe(3); // ADDED CHECK

      const horizontalSplitView = app.shadowRoot!.querySelector('split-view');
      expect(horizontalSplitView).not.toBeNull();
      const columns = horizontalSplitView!.querySelectorAll(
        ':scope > split-view',
      );
      expect(columns.length).toBe(3);

      // Check panes in first column
      const col1Panes = columns[0].querySelectorAll('pane-view');
      expect(col1Panes.length).toBe(3);
      expect(col1Panes[0].getAttribute('pane-title')).toBe('Search');
      expect(col1Panes[1].getAttribute('pane-title')).toBe('Process List');
      expect(col1Panes[2].getAttribute('pane-title')).toBe('Process Tree');

      // Check panes in second column
      const col2Panes = columns[1].querySelectorAll('pane-view');
      expect(col2Panes.length).toBe(5);
      expect(col2Panes[0].getAttribute('pane-title')).toBe('Ancestry');
      expect(col2Panes[1].getAttribute('pane-title')).toBe('Pipeline');
      expect(col2Panes[2].getAttribute('pane-title')).toBe('Inputs');
      expect(col2Panes[3].getAttribute('pane-title')).toBe('Outputs');
      expect(col2Panes[4].getAttribute('pane-title')).toBe('Arguments');

      // Check panes in third column
      const col3Panes = columns[2].querySelectorAll('pane-view');
      expect(col3Panes.length).toBe(2);
      expect(col3Panes[0].getAttribute('pane-title')).toBe('Analysis');
      expect(col3Panes[1].getAttribute('pane-title')).toBe('Argv[0] Histogram');
    });

    it('should render columns based on custom column config', async () => {
      app.graph = createTestGraph({actions: []});
      app.columns = [[PaneId.SEARCH], [PaneId.ANALYSIS]];
      await waitForUpdate();

      const horizontalSplitView = app.shadowRoot!.querySelector('split-view');
      expect(horizontalSplitView).not.toBeNull();
      const columns = horizontalSplitView!.querySelectorAll(
        ':scope > split-view',
      );
      expect(columns.length).toBe(2);

      // Check panes in first column
      const col1Panes = columns[0].querySelectorAll('pane-view');
      expect(col1Panes.length).toBe(1);
      expect(col1Panes[0].getAttribute('pane-title')).toBe('Search');

      // Check panes in second column
      const col2Panes = columns[1].querySelectorAll('pane-view');
      expect(col2Panes.length).toBe(1);
      expect(col2Panes[0].getAttribute('pane-title')).toBe('Analysis');
    });
  });

  describe('Histogram row click', () => {
    it('should not throw when search pane is hidden', async () => {
      app.graph = createTestGraph({
        actions: [createTestAction({id: 1, args: ['action1']})],
      });
      // Remove Search pane from columns to hide it.
      app.columns = app.columns.map((col) =>
        col.filter((id) => id !== PaneId.SEARCH),
      );
      await waitForUpdate();

      const histogramPane = app.shadowRoot!.querySelector(
        '#histogram',
      ) as HistogramPane;
      expect(histogramPane).not.toBeNull();

      const event = new CustomEvent<HistogramRowClickedEventDetail>(
        'histogram-row-clicked',
        {
          detail: {query: 'action1'},
          bubbles: true,
          composed: true,
        },
      );

      // Expect no exception to be thrown.
      expect(() => {
        histogramPane.dispatchEvent(event);
      }).not.toThrow();
    });

    it('should set search query and open search pane if visible', async () => {
      app.graph = createTestGraph({
        actions: [createTestAction({id: 1, args: ['action1']})],
      });
      // Ensure search pane is in columns.
      app.columns = [[PaneId.SEARCH, PaneId.HISTOGRAM], [], []];
      await waitForUpdate();
      await waitForUpdate();

      const histogramPane = app.shadowRoot!.querySelector(
        '#histogram',
      ) as HistogramPane;
      expect(histogramPane).not.toBeNull();
      const searchPane = app.shadowRoot!.querySelector('#search') as SearchPane;
      expect(searchPane).not.toBeNull();
      const searchPaneView = app.shadowRoot!.querySelector(
        '#search-pane-view',
      ) as PaneView;
      expect(searchPaneView).not.toBeNull();

      const setSearchQuerySpy = spyOn(searchPane, 'setSearchQuery');
      const toggleSpy = spyOn(searchPaneView, 'toggle');

      // Close search pane first to test toggle.
      searchPaneView.open = false;

      const event = new CustomEvent<HistogramRowClickedEventDetail>(
        'histogram-row-clicked',
        {
          detail: {query: 'action1'},
          bubbles: true,
          composed: true,
        },
      );
      histogramPane.dispatchEvent(event);

      expect(setSearchQuerySpy).toHaveBeenCalledWith('action1');
      expect(toggleSpy).toHaveBeenCalled();
    });
  });
});
