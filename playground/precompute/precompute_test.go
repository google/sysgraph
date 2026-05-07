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

package precompute

import (
	"testing"
	"time"

	"github.com/google/go-cmp/cmp"
	"github.com/google/sysgraph/analysis/rules"
	pgpb "github.com/google/sysgraph/proto/playground"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/testing/protocmp"
)

func TestConvertAnalysis(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name    string
		matches []ruleMatch
		paths   []string
		want    *pgpb.Analysis
		wantErr bool
	}{
		{
			name: "empty",
			want: &pgpb.Analysis{},
		},
		{
			name: "single rule",
			matches: []ruleMatch{
				{
					RuleName:      "rule1",
					Description:   "description1",
					Confidence:    string(rules.HighConfidence),
					ActionIDChain: []int64{1, 2},
					Resources:     []string{"path1", "path2"},
					StartTime:     now,
				},
			},
			paths: []string{"path0", "path1", "path2"},
			want: pgpb.Analysis_builder{
				Rules: []*pgpb.Rule{
					pgpb.Rule_builder{
						RuleName:    proto.String("rule1"),
						Description: proto.String("description1"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{
								ProcessIds:  []int64{1, 2},
								ResourceIds: []int64{1, 2},
							}.Build(),
						},
					}.Build(),
				},
			}.Build(),
		},
		{
			name: "multiple matches for the same rule",
			matches: []ruleMatch{
				{
					RuleName:      "rule1",
					Description:   "description1",
					Confidence:    string(rules.HighConfidence),
					ActionIDChain: []int64{1, 2},
					Resources:     []string{"path1"},
					StartTime:     now,
				},
				{
					RuleName:      "rule1",
					Description:   "description1",
					Confidence:    string(rules.HighConfidence),
					ActionIDChain: []int64{3},
					Resources:     []string{"path2"},
					StartTime:     now.Add(time.Second),
				},
			},
			paths: []string{"path0", "path1", "path2"},
			want: pgpb.Analysis_builder{
				Rules: []*pgpb.Rule{
					pgpb.Rule_builder{
						RuleName:    proto.String("rule1"),
						Description: proto.String("description1"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{
								ProcessIds:  []int64{1, 2},
								ResourceIds: []int64{1},
							}.Build(),
							pgpb.RuleMatch_builder{
								ProcessIds:  []int64{3},
								ResourceIds: []int64{2},
							}.Build(),
						},
					}.Build(),
				},
			}.Build(),
		},
		{
			name: "multiple rules",
			matches: []ruleMatch{
				{
					RuleName:      "rule1",
					Description:   "description1",
					Confidence:    string(rules.HighConfidence),
					ActionIDChain: []int64{1},
					Resources:     []string{"path1"},
					StartTime:     now,
				},
				{
					RuleName:      "rule2",
					Description:   "description2",
					Confidence:    string(rules.HighConfidence),
					ActionIDChain: []int64{2},
					Resources:     []string{"path2"},
					StartTime:     now.Add(time.Second),
				},
			},
			paths: []string{"path0", "path1", "path2"},
			want: pgpb.Analysis_builder{
				Rules: []*pgpb.Rule{
					pgpb.Rule_builder{
						RuleName:    proto.String("rule1"),
						Description: proto.String("description1"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{
								ProcessIds:  []int64{1},
								ResourceIds: []int64{1},
							}.Build(),
						},
					}.Build(),
					pgpb.Rule_builder{
						RuleName:    proto.String("rule2"),
						Description: proto.String("description2"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{
								ProcessIds:  []int64{2},
								ResourceIds: []int64{2},
							}.Build(),
						},
					}.Build(),
				},
			}.Build(),
		},
		{
			name: "resource not found",
			matches: []ruleMatch{
				{
					RuleName:      "rule1",
					Description:   "description1",
					Confidence:    string(rules.HighConfidence),
					ActionIDChain: []int64{1},
					Resources:     []string{"path3"},
					StartTime:     now,
				},
			},
			paths:   []string{"path0", "path1", "path2"},
			wantErr: true,
		},
		{
			name: "sort rules by confidence then start time",
			matches: []ruleMatch{
				{
					RuleName:    "ruleLow",
					Confidence:  string(rules.LowConfidence),
					StartTime:   now.Add(2 * time.Second),
					Description: "descLow",
				},
				{
					RuleName:    "ruleHigh",
					Confidence:  string(rules.HighConfidence),
					StartTime:   now,
					Description: "descHigh",
				},
				{
					RuleName:    "ruleLowEarly",
					Confidence:  string(rules.LowConfidence),
					StartTime:   now.Add(time.Second),
					Description: "descLowEarly",
				},
			},
			paths: []string{"path0"},
			want: pgpb.Analysis_builder{
				Rules: []*pgpb.Rule{
					pgpb.Rule_builder{
						RuleName:    proto.String("ruleHigh"),
						Description: proto.String("descHigh"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{}.Build(), // Empty matches because we didn't specify ActionIDChain/Resources
						},
					}.Build(),
					pgpb.Rule_builder{
						RuleName:    proto.String("ruleLowEarly"),
						Description: proto.String("descLowEarly"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{}.Build(),
						},
					}.Build(),
					pgpb.Rule_builder{
						RuleName:    proto.String("ruleLow"),
						Description: proto.String("descLow"),
						Matches: []*pgpb.RuleMatch{
							pgpb.RuleMatch_builder{}.Build(),
						},
					}.Build(),
				},
			}.Build(),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := convertAnalysis(tc.matches, tc.paths)
			if (err != nil) != tc.wantErr {
				t.Errorf("convertAnalysis() returned error: %v, wantErr: %v", err, tc.wantErr)
			}
			if diff := cmp.Diff(tc.want, got, protocmp.Transform()); diff != "" {
				t.Errorf("convertAnalysis() returned an unexpected diff (-want +got):\n%s", diff)
			}
		})
	}
}
