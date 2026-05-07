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

// Package sgoutput provides functions for rendering sysgraph rule
// evaluations.
package sgoutput

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"maps"
	"os"
	"slices"

	"github.com/google/oss-rebuild/pkg/sysgraph/sgmatch"
	"github.com/google/sysgraph/analysis/rules"
	"golang.org/x/term"

	sgpb "github.com/google/oss-rebuild/pkg/sysgraph/proto/sysgraph"
)

var stdout io.Writer = os.Stdout

// Output is a sink for rule match results.
type Output interface {
	Write(context.Context, []rules.RuleMatch, string) error
}

var _ Output = (*terminalOutput)(nil)
var _ Output = namesOutput{}

// NewOutput returns an output sink for the given output name.
func NewOutput(ctx context.Context, name string) (Output, error) {
	switch name {
	case "terminal":
		return &terminalOutput{}, nil
	case "names":
		return namesOutput{}, nil
	case "json":
		return jsonOutput{sinker: func(string) io.Writer { return stdout }}, nil
	}
	return nil, fmt.Errorf("no output sink %q", name)
}

type namesOutput struct{}

func (namesOutput) Write(_ context.Context, matches []rules.RuleMatch, path string) error {
	if len(matches) == 0 {
		return nil
	}
	mm := map[string]int{}
	for _, m := range matches {
		mm[m.Name]++

	}
	fmt.Fprintf(stdout, "Matches for %s: ", path)
	for _, k := range slices.Sorted(maps.Keys(mm)) {
		fmt.Fprintf(stdout, "%s: %d ", k, mm[k])
	}
	fmt.Fprintln(stdout)
	return nil
}

type terminalOutput struct {
	width int
}

// PrintChainsTerm prints a chain of actions in a terminal-friendly format.
func (t *terminalOutput) Write(_ context.Context, matches []rules.RuleMatch, path string) error {
	if len(matches) == 0 {
		return nil
	}
	width := 0
	if t.width == 0 {
		var err error
		width, _, err = term.GetSize(0)
		if err != nil {
			return fmt.Errorf("failed to get terminal size: %w", err)
		}
	} else {
		width = t.width
	}
	blue, reset := "", ""
	// Color the output if we're writing to a terminal.
	if f, ok := stdout.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		blue = "\033[1;34m"
		reset = "\033[0m"
	}
	fmt.Fprintf(stdout, "%sFor sysgraph %s:%s\n", blue, path, reset)
	for _, match := range matches {
		chain := match.Match
		indent := ""
		for i := len(chain.Actions) - 1; i >= 0; i-- {
			fmt.Fprint(stdout, indent)
			printActionTerm(chain.Actions[i], width-len(indent))
			indent = indent + "  "
		}
		fmt.Fprintln(stdout, "Matched files:")
		for key, values := range chain.Values {
			fmt.Fprintf(stdout, "%s:\n", key)
			for _, value := range values {
				fmt.Fprintln(stdout, value.GetFileInfo().GetPath())
			}
		}
	}
	return nil
}

func printActionTerm(action *sgpb.Action, width int) {
	pid := fmt.Sprintf("[%d] ", action.GetId())
	width -= len(pid)
	fmt.Fprint(stdout, pid)

	argv := action.GetExecInfo().GetArgv()
	fmt.Fprint(stdout, argv[0])
	width -= len(argv[0])

	if len(argv) <= 1 {
		fmt.Fprintln(stdout)
		return
	}

	for i, arg := range argv[1:] {
		if len(arg) > width || (len(arg) > width-4 && i != len(argv)-1) {
			fmt.Fprint(stdout, "...")
			break
		}
		width -= len(arg) + 1
		fmt.Fprint(stdout, " ")
		fmt.Fprint(stdout, arg)
	}
	fmt.Fprintln(stdout)
}

// RuleEvaluation represents a single rule evaluation.
type RuleEvaluation struct {
	Name        string   `json:"rule_name"`
	Description string   `json:"description"`
	Confidence  string   `json:"confidence"`
	Path        string   `json:"path"`
	Chain       []int64  `json:"action_id_chain"`
	Resources   []string `json:"resources"`
}

func actionIDs(actions []*sgpb.Action) []int64 {
	ids := make([]int64, 0, len(actions))
	for _, action := range actions {
		ids = append(ids, action.GetId())
	}
	return ids
}

func flatten[S ~[]E, E any](ss iter.Seq[S]) iter.Seq[E] {
	return func(yield func(E) bool) {
		for s := range ss {
			for _, e := range s {
				if !yield(e) {
					return
				}
			}
		}
	}
}

func resources(values map[string][]sgmatch.ExtractedValue) []string {
	res := make([]string, 0, len(values))
	for value := range flatten(maps.Values(values)) {
		if !value.HasResource() || !value.HasFileInfo() {
			continue
		}
		res = append(res, value.GetFileInfo().GetPath())
	}
	return res
}

type jsonOutput struct {
	sinker func(string) io.Writer
}

// PrintChainsJSON prints a chain of actions in JSON format.
func (j jsonOutput) Write(_ context.Context, matches []rules.RuleMatch, path string) error {
	evaluations := make([]RuleEvaluation, 0, len(matches))
	for _, match := range matches {
		evaluations = append(evaluations, RuleEvaluation{
			Name:        match.Name,
			Description: match.Description,
			Confidence:  string(match.Confidence),
			Path:        path,
			Chain:       actionIDs(match.Match.Actions),
			Resources:   resources(match.Match.Values),
		})
	}
	out, err := json.MarshalIndent(evaluations, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	s := j.sinker(path)
	if _, err := s.Write(out); err != nil {
		return fmt.Errorf("failed to write JSON: %w", err)
	}
	return nil
}

