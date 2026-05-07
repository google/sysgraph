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

import {Action, Graph} from './graph.js';
import {PipelinePane} from './pipeline_pane.js';
import {createTestAction, createTestGraph} from './test_utils.js';

describe('PipelinePane', () => {
  let component: PipelinePane;
  let graph: Graph;
  let actions: Action[];

  beforeEach(async () => {
    component = new PipelinePane();
    document.body.appendChild(component);
    await component.updateComplete;
    actions = [];
    graph = createTestGraph({actions});
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  const addAction = (action: Action) => {
    actions.push(action);
    graph.actionsById.set(action.id, action);
    if (!graph.actionsByPid.has(action.pid)) {
      graph.actionsByPid.set(action.pid, []);
    }
    graph.actionsByPid.get(action.pid)!.push(action);
    graph.computePipelineGroups();
  };

  it('should render "None" if action is null', async () => {
    const action = createTestAction({id: 1, pid: 1001});
    addAction(action);
    component.action = null;
    component.graph = graph;
    component.selectedActionID = 1;
    await component.updateComplete;

    const noPipes = component.shadowRoot!.querySelector('.no-pipes');
    expect(noPipes).not.toBeNull();
    expect(noPipes!.textContent).toBe('None');
  });

  it('should render "None" if no pipeline is present', async () => {
    const action = createTestAction({id: 1, pid: 1001});
    addAction(action);
    component.action = action;
    component.graph = graph;
    component.selectedActionID = 1;
    await component.updateComplete;

    const noPipes = component.shadowRoot!.querySelector('.no-pipes');
    expect(noPipes).not.toBeNull();
    expect(noPipes!.textContent).toBe('None');
  });

  it('should render a single action pipeline', async () => {
    const action = createTestAction({id: 1, pid: 1001, pipeWriteToActionId: 2});
    const action2 = createTestAction({
      id: 2,
      pid: 1002,
      pipeReadFromActionId: 1,
    });
    addAction(action);
    addAction(action2);

    component.action = action;
    component.graph = graph;
    component.selectedActionID = 1;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(2);
    expect(elements[0].getAttribute('data-id')).toBe('1');
    expect(elements[1].getAttribute('data-id')).toBe('2');
    expect(
      component.shadowRoot!.querySelectorAll('.pipe-separator').length,
    ).toBe(1);
  });

  it('should render a multi-action linear pipeline', async () => {
    const action1 = createTestAction({
      id: 1,
      pid: 1001,
      pipeWriteToActionId: 2,
    });
    const action2 = createTestAction({
      id: 2,
      pid: 1002,
      pipeReadFromActionId: 1,
      pipeWriteToActionId: 3,
    });
    const action3 = createTestAction({
      id: 3,
      pid: 1003,
      pipeReadFromActionId: 2,
    });
    addAction(action1);
    addAction(action2);
    addAction(action3);

    component.action = action2;
    component.graph = graph;
    component.selectedActionID = 2;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(3);
    expect(elements[0].getAttribute('data-id')).toBe('1');
    expect(elements[1].getAttribute('data-id')).toBe('2');
    expect(elements[2].getAttribute('data-id')).toBe('3');
    expect(
      component.shadowRoot!.querySelectorAll('.pipe-separator').length,
    ).toBe(2);
  });

  it('should include sibling processes with the same PID', async () => {
    const action1 = createTestAction({
      id: 1,
      pid: 1001,
      pipeWriteToActionId: 2,
    });
    const action1b = createTestAction({id: 10, pid: 1001}); // Sibling of action1
    const action2 = createTestAction({
      id: 2,
      pid: 1002,
      pipeReadFromActionId: 1,
    });
    addAction(action1);
    addAction(action1b);
    addAction(action2);

    component.action = action1;
    component.graph = graph;
    component.selectedActionID = 1;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(3);
    // Order within the same PID group depends on startElapsedNanos, default is by ID
    expect(elements[0].getAttribute('data-id')).toBe('1');
    expect(elements[1].getAttribute('data-id')).toBe('10');
    expect(elements[2].getAttribute('data-id')).toBe('2');
  });

  it('should handle pipelines starting from the middle', async () => {
    const action1 = createTestAction({
      id: 1,
      pid: 1001,
      pipeWriteToActionId: 2,
    });
    const action2 = createTestAction({
      id: 2,
      pid: 1002,
      pipeReadFromActionId: 1,
      pipeWriteToActionId: 3,
    });
    const action3 = createTestAction({
      id: 3,
      pid: 1003,
      pipeReadFromActionId: 2,
    });
    addAction(action1);
    addAction(action2);
    addAction(action3);

    component.action = action2;
    component.graph = graph;
    component.selectedActionID = 2;
    await component.updateComplete;

    const elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(3);
    expect(elements[0].getAttribute('data-id')).toBe('1');
    expect(elements[1].getAttribute('data-id')).toBe('2');
    expect(elements[2].getAttribute('data-id')).toBe('3');
  });

  it('should update the pipeline view on subsequent calls', async () => {
    const action1 = createTestAction({
      id: 1,
      pid: 1001,
      pipeWriteToActionId: 2,
    });
    const action2 = createTestAction({
      id: 2,
      pid: 1002,
      pipeReadFromActionId: 1,
    });
    const action3 = createTestAction({id: 3, pid: 1003});
    const action4 = createTestAction({
      id: 4,
      pid: 1004,
      pipeWriteToActionId: 5,
    });
    const action5 = createTestAction({
      id: 5,
      pid: 1005,
      pipeReadFromActionId: 4,
    });
    addAction(action1);
    addAction(action2);
    addAction(action3);
    addAction(action4);
    addAction(action5);

    // Initial render with a pipeline
    component.action = action1;
    component.graph = graph;
    component.selectedActionID = 1;
    await component.updateComplete;

    let elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(2);
    expect(component.shadowRoot!.querySelector('.no-pipes')).toBeNull();

    // Render with an action with no pipeline
    component.action = action3;
    component.selectedActionID = 3;
    await component.updateComplete;

    const noPipesElement = component.shadowRoot!.querySelector('.no-pipes');
    expect(noPipesElement).not.toBeNull();
    expect(noPipesElement!.textContent).toContain('None');
    elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(0);

    // Render again with a different pipeline
    component.action = action4;
    component.selectedActionID = 4;
    await component.updateComplete;
    elements = component.shadowRoot!.querySelectorAll('action-element');
    expect(elements.length).toBe(2);
    expect(elements[0].getAttribute('data-id')).toBe('4');
    expect(elements[1].getAttribute('data-id')).toBe('5');
    expect(component.shadowRoot!.querySelector('.no-pipes')).toBeNull();
  });
});
