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

import {AnalysisPane} from './analysis_pane.js';
import {Analysis} from './graph.js';
import {createTestAction, createTestGraph} from './test_utils.js';

describe('AnalysisPane', () => {
  let component: AnalysisPane;

  beforeEach(async () => {
    component = new AnalysisPane();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should display "No findings." if analysis is null', async () => {
    component.graph = createTestGraph({analysis: null});
    component.selectedActionID = -1;
    await component.updateComplete;
    expect(component.shadowRoot!.textContent).toContain('No findings.');
  });

  it('should display "No findings." if analysis has no rules', async () => {
    component.graph = createTestGraph({analysis: {rules: []}});
    component.selectedActionID = -1;
    await component.updateComplete;
    expect(component.shadowRoot!.textContent).toContain('No findings.');
  });

  it('should render rules and their descriptions', async () => {
    const analysis: Analysis = {
      rules: [
        {ruleName: 'Rule1', description: 'Desc1', matches: []},
        {ruleName: 'Rule2', description: 'Desc2', matches: []},
      ],
    };
    component.graph = createTestGraph({analysis});
    component.selectedActionID = -1;
    await component.updateComplete;

    const ruleElements = component.shadowRoot!.querySelectorAll('.rule');
    expect(ruleElements.length).toBe(2);

    const rule1Header = ruleElements[0].querySelector('.rule-header');
    expect(rule1Header).not.toBeNull();
    expect(rule1Header!.querySelector('.rule-name')!.textContent).toBe('Rule1');
    expect(rule1Header!.textContent).toContain('Desc1');

    const rule2Header = ruleElements[1].querySelector('.rule-header');
    expect(rule2Header).not.toBeNull();
    expect(rule2Header!.querySelector('.rule-name')!.textContent).toBe('Rule2');
    expect(rule2Header!.textContent).toContain('Desc2');
  });

  it('should render action elements for rule matches', async () => {
    const action1 = createTestAction({id: 1, parentId: 0});
    const action2 = createTestAction({id: 2, parentId: 1});
    const analysis: Analysis = {
      rules: [
        {
          ruleName: 'Rule1',
          description: 'Desc1',
          matches: [{processIds: [1], resourceIds: []}],
        },
        {
          ruleName: 'Rule2',
          description: 'Desc2',
          matches: [{processIds: [2], resourceIds: []}],
        },
      ],
    };
    const graph = createTestGraph({analysis});
    graph.actionsById.set(1, action1);
    graph.actionsById.set(2, action2);
    component.graph = graph;
    component.selectedActionID = -1;
    await component.updateComplete;

    const ruleElements = component.shadowRoot!.querySelectorAll('.rule');
    expect(ruleElements.length).toBe(2);

    // Check first rule
    const rule1Header = ruleElements[0].querySelector('.rule-header');
    expect(rule1Header).not.toBeNull();
    expect(rule1Header!.querySelector('.rule-name')!.textContent).toBe('Rule1');
    expect(rule1Header!.textContent).toContain('Desc1');
    const actionElements1 = ruleElements[0].querySelectorAll('action-element');
    expect(actionElements1.length).toBe(1);
    expect(actionElements1[0].getAttribute('data-id')).toBe('1');

    // Check second rule
    const rule2Header = ruleElements[1].querySelector('.rule-header');
    expect(rule2Header).not.toBeNull();
    expect(rule2Header!.querySelector('.rule-name')!.textContent).toBe('Rule2');
    expect(rule2Header!.textContent).toContain('Desc2');
    const actionElements2 = ruleElements[1].querySelectorAll('action-element');
    expect(actionElements2.length).toBe(1);
    expect(actionElements2[0].getAttribute('data-id')).toBe('2');
  });

  it('should handle multiple matches for the same rule', async () => {
    const action1 = createTestAction({id: 1, parentId: 0});
    const action3 = createTestAction({id: 3, parentId: 0});
    const analysis: Analysis = {
      rules: [
        {
          ruleName: 'RuleA',
          description: 'DescA',
          matches: [
            {processIds: [1], resourceIds: []},
            {processIds: [3], resourceIds: []},
          ],
        },
      ],
    };
    const graph = createTestGraph({analysis});
    graph.actionsById.set(1, action1);
    graph.actionsById.set(3, action3);
    component.graph = graph;
    component.selectedActionID = -1;
    await component.updateComplete;

    const ruleElements = component.shadowRoot!.querySelectorAll('.rule');
    expect(ruleElements.length).toBe(1);
    const actionElements = ruleElements[0].querySelectorAll('action-element');
    expect(actionElements.length).toBe(2);
    expect(actionElements[0].getAttribute('data-id')).toBe('1');
    expect(actionElements[1].getAttribute('data-id')).toBe('3');
  });

  it('should not render action if processId not found in ACTIONS_BY_ID', async () => {
    const analysis: Analysis = {
      rules: [
        {
          ruleName: 'RuleX',
          description: 'DescX',
          matches: [{processIds: [999], resourceIds: []}],
        },
      ],
    };
    component.graph = createTestGraph({analysis});
    component.selectedActionID = -1;
    await component.updateComplete;

    const ruleElements = component.shadowRoot!.querySelectorAll('.rule');
    expect(ruleElements.length).toBe(1);
    const ruleHeader = ruleElements[0].querySelector('.rule-header');
    expect(ruleHeader).not.toBeNull();
    expect(ruleHeader!.querySelector('.rule-name')!.textContent).toBe('RuleX');
    expect(ruleHeader!.textContent).toContain('DescX');
    expect(ruleElements[0].querySelectorAll('action-element').length).toBe(0);
  });
});
