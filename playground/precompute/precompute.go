// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Package precompute provides a function to create a SysGraphResponse proto from a SysGraph.
package precompute

import (
	"cmp"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/google/oss-rebuild/pkg/sysgraph/pbdigest"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgtransform"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/google/sysgraph/analysis/rules"
	pgpb "github.com/google/sysgraph/proto/playground"
)


// Client is a client for precomputed responses for the sysgraph playground.
type Client struct{}

// NewClient creates a new Client.
func NewClient(ctx context.Context) (*Client, error) {
	return &Client{}, nil
}

// SysGraphResponse creates a SysGraphResponse proto, marshals it to
// gzip-compressed JSON, and writes it to the provided writer.
func (c *Client) SysGraphResponse(ctx context.Context, path string, sg sgtransform.SysGraph, w io.Writer) error {
	ids, err := sg.ActionIDs(ctx)
	if err != nil {
		return err
	}

	actionsByID := map[int64]*pgpb.Process{}
	uniquePaths := map[string]bool{}
	actionIDsByFileReadPath := map[string][]int64{}
	actionIDsByFileWritePath := map[string][]int64{}
	actionIDsByExecID := map[string]int64{}

	type pair struct {
		readExecID  string
		writeExecID string
	}
	pairs := map[pair]bool{}

	var actions []*pgpb.Process
	for _, id := range ids {
		a, err := sg.Action(ctx, id)
		if err != nil {
			return fmt.Errorf("failed to get action %d: %w", id, err)
		}
		a2 := pgpb.Process_builder{
			Id:               new(a.GetId()),
			ParentId:         new(a.GetParentActionId()),
			Pid:              new(a.GetExecInfo().GetPid()),
			StartTime:        a.GetStartTime(),
			EndTime:          a.GetEndTime(),
			WorkingDirectory: new(a.GetExecInfo().GetWorkingDirectory()),
			Args:             a.GetExecInfo().GetArgv(),
		}.Build()

		// Distinguish actions with 0 exit code vs actions that don't have exit code set.
		if a.HasExitSignal() {
			a2.SetExitSignal(a.GetExitSignal())
		}
		if a.HasExitStatus() {
			a2.SetExitStatus(a.GetExitStatus())
		}
		actionsByID[a.GetId()] = a2

		metadata := a.GetMetadata()
		if execID, ok := metadata["exec_id"]; ok {
			actionIDsByExecID[execID] = id
		}

		// Collect resource paths from inputs
		for strDg := range a.GetInputs() {
			dg, err := pbdigest.NewFromString(strDg)
			if err != nil {
				return fmt.Errorf("failed to parse input digest %q for action %d: %w", strDg, id, err)
			}
			res, err := sg.Resource(ctx, dg)
			if err != nil {
				return fmt.Errorf("failed to get input resource for digest %q action %d: %w", strDg, id, err)
			}
			if path := res.GetFileInfo().GetPath(); path != "" {
				uniquePaths[path] = true
				actionIDsByFileReadPath[path] = append(actionIDsByFileReadPath[path], id)
			}
			pi := res.GetPipeInfo()
			if pi == nil {
				continue
			}
			readID := pi.GetReadExecId()
			writeID := pi.GetWriteExecId()
			pairs[pair{readID, writeID}] = true
		}

		// Collect resource paths from outputs
		for strDg := range a.GetOutputs() {
			dg, err := pbdigest.NewFromString(strDg)
			if err != nil {
				return fmt.Errorf("failed to parse output digest %q for action %d: %w", strDg, id, err)
			}
			res, err := sg.Resource(ctx, dg)
			if err != nil {
				return fmt.Errorf("failed to get output resource for digest %q action %d: %w", strDg, id, err)
			}
			if path := res.GetFileInfo().GetPath(); path != "" {
				uniquePaths[path] = true
				actionIDsByFileWritePath[path] = append(actionIDsByFileWritePath[path], id)
			}
			pi := res.GetPipeInfo()
			if pi == nil {
				continue
			}
			readID := pi.GetReadExecId()
			writeID := pi.GetWriteExecId()
			pairs[pair{readID, writeID}] = true
		}

		actions = append(actions, a2)
	}

	for p := range pairs {
		readID := actionIDsByExecID[p.readExecID]
		writeID := actionIDsByExecID[p.writeExecID]
		a := actionsByID[readID]
		if a != nil {
			a.SetPipeReadFromActionId(writeID)
		}
	}

	// Action IDs aren't sorted by time (yet).
	slices.SortFunc(actions, func(a1, a2 *pgpb.Process) int {
		return cmp.Or(
			a1.GetStartTime().AsTime().Compare(a2.GetStartTime().AsTime()),
			cmp.Compare(a1.GetPid(), a2.GetPid()),
		)
	})

	paths := slices.Sorted(maps.Keys(uniquePaths))

	for i, p := range paths {
		ids := actionIDsByFileReadPath[p]
		for _, id := range ids {
			a := actionsByID[id]
			a.SetFileReadIds(append(a.GetFileReadIds(), int64(i)))
		}
		ids = actionIDsByFileWritePath[p]
		for _, id := range ids {
			a := actionsByID[id]
			a.SetFileWriteIds(append(a.GetFileWriteIds(), int64(i)))
		}
	}

	analysisProto, analysisError, err := runAnalysis(ctx, sg, paths)
	if err != nil {
		return err
	}

	respPB := pgpb.SysGraphResponse_builder{
		Graph: pgpb.SysGraph_builder{
			Processes:     actions,
			Files:         paths,
			Analysis:      analysisProto,
			AnalysisError: new(analysisError),
		}.Build(),
	}.Build()
	respJS, err := protojson.Marshal(respPB)
	if err != nil {
		return err
	}
	gz, err := gzip.NewWriterLevel(w, 2)
	if err != nil {
		return err
	}
	if _, err := gz.Write(respJS); err != nil {
		return err
	}
	return gz.Close()
}

type ruleMatch struct {
	RuleName      string
	Description   string
	Confidence    string
	ActionIDChain []int64
	Resources     []string
	StartTime     time.Time
}

func runAnalysis(ctx context.Context, sg sgtransform.SysGraph, paths []string) (*pgpb.Analysis, string, error) {
	// Run analysis rules
	analysisRules, err := rules.NewRules("all")
	if err != nil {
		return nil, "", fmt.Errorf("failed to create rules: %w", err)
	}
	matches, err := analysisRules.Run(ctx, sg)
	var analysisError string
	if err != nil {
		analysisError = err.Error()
	}

	var inputs []ruleMatch
	for _, m := range matches {
		var earliestStart time.Time
		var processIDs []int64
		for _, a := range m.Match.Actions {
			processIDs = append(processIDs, a.GetId())
			t := a.GetStartTime().AsTime()
			if earliestStart.IsZero() || t.Before(earliestStart) {
				earliestStart = t
			}
		}

		var resources []string
		for _, vSlice := range m.Match.Values {
			for _, v := range vSlice {
				if v.HasResource() && v.HasFileInfo() {
					resources = append(resources, v.GetFileInfo().GetPath())
				}
			}
		}

		inputs = append(inputs, ruleMatch{
			RuleName:      m.Name,
			Description:   m.Description,
			Confidence:    string(m.Confidence),
			ActionIDChain: processIDs,
			Resources:     resources,
			StartTime:     earliestStart,
		})
	}

	analysisProto, err := convertAnalysis(inputs, paths)
	if err != nil {
		return nil, "", err
	}

	return analysisProto, analysisError, nil
}

func convertAnalysis(matches []ruleMatch, paths []string) (*pgpb.Analysis, error) {
	pathIDs := map[string]int64{}
	for i, p := range paths {
		pathIDs[p] = int64(i)
	}

	// Sort matches: Confidence desc (Highest first), then StartTime asc
	slices.SortFunc(matches, func(a, b ruleMatch) int {
		diff := rules.CompareConfidence(a.Confidence, b.Confidence)
		if diff != 0 {
			return diff
		}
		return a.StartTime.Compare(b.StartTime)
	})

	var ruleBuilders []*pgpb.Rule_builder
	rulesByName := make(map[string]*pgpb.Rule_builder)

	for _, m := range matches {
		rb, ok := rulesByName[m.RuleName]
		if !ok {
			rb = &pgpb.Rule_builder{
				RuleName:    new(m.RuleName),
				Description: new(m.Description),
			}
			rulesByName[m.RuleName] = rb
			ruleBuilders = append(ruleBuilders, rb)
		}

		var resourceIDs []int64
		for _, r := range m.Resources {
			if idx, ok := pathIDs[r]; ok {
				resourceIDs = append(resourceIDs, idx)
			} else {
				return nil, fmt.Errorf("resource %q not found in graph", r)
			}
		}

		rb.Matches = append(rb.Matches, pgpb.RuleMatch_builder{
			ProcessIds:  m.ActionIDChain,
			ResourceIds: resourceIDs,
		}.Build())
	}

	var protoRules []*pgpb.Rule
	for _, rb := range ruleBuilders {
		protoRules = append(protoRules, rb.Build())
	}

	analysisProto := pgpb.Analysis_builder{
		Rules: protoRules,
	}.Build()

	return analysisProto, nil
}
