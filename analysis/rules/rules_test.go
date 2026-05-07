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

package rules

import (
	"context"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/google/oss-rebuild/pkg/sysgraph/inmemory"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgmatch"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgstorage"
	"google.golang.org/protobuf/testing/protocmp"

	sgpb "github.com/google/oss-rebuild/pkg/sysgraph/proto/sysgraph"
)

func TestRun(t *testing.T) {
	tests := []struct {
		desc       string
		ruleToTest string
		graph      func(context.Context) *inmemory.SysGraph
		want       func(*inmemory.SysGraph) []RuleMatch
	}{
		{
			desc: "NoMatches",
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/gcc")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/gcc", "hello.c"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/as")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/as", "hello.s"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddOutput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/hello.o")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("3").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/cp")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("3").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/cp", "/src/out/foo_amd64.deb", "/out/"}}.Build()
				return builder.Build(ctx)
			},
		},
		{
			desc:       "KeesSoreThumbMatch",
			ruleToTest: keesSoreThumbName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/bin/bash")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/bin/bash", "hello.c"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/head")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/head", "hello.s"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddOutput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/hello.o")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				return builder.Build(ctx)
			},
			want: func(sg *inmemory.SysGraph) []RuleMatch {
				return []RuleMatch{{
					Name:        keesSoreThumbName,
					UpdateTime:  mustParseDate("2025-11-10"),
					Description: keesSoreThumbDescription,
					Confidence:  HighConfidence,
					Match: sgmatch.Chain{
						Actions: []*sgpb.Action{sg.Actions[2], sg.Actions[1]},
						Values: map[string][]sgmatch.ExtractedValue{
							"output": []sgmatch.ExtractedValue{{
								Resource: sgpb.Resource_builder{
									FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/hello.o")}.Build(),
								}.Build(),
							}},
						},
					},
				}}
			},
		},
		{
			desc:       "KeesSoreThumbLibtool",
			ruleToTest: keesSoreThumbName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/bin/bash")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/bin/bash", "./libtool"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/ar")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/ar", "hello.s"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddOutput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/hello.o")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				return builder.Build(ctx)
			},
		},
		{
			desc:       "KeesSoreThumbBinShLibtool",
			ruleToTest: keesSoreThumbName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/bin/sh")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/bin/sh", "../libtool"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/ar")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/ar", "hello.s"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddOutput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/hello.o")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				return builder.Build(ctx)
			},
		},
		{
			desc:       "KeesSoreThumbNotIncluded",
			ruleToTest: netReadName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/bin/bash")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/bin/bash", "hello.c"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/head")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/head", "hello.s"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddOutput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/hello.o")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				return builder.Build(ctx)
			},
		},
		{
			desc:       "TestDataInNonTestPathMatch",
			ruleToTest: readTestDataInNonTestPathName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/make")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/make", "all"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/head")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/cat", "foo_test.c"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddInput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/foo/tests/foo_test.c")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				return builder.Build(ctx)
			},
			want: func(sg *inmemory.SysGraph) []RuleMatch {
				return []RuleMatch{{
					Name:        readTestDataInNonTestPathName,
					UpdateTime:  mustParseDate("2025-08-01"),
					Description: nonTestPathDescription,
					Confidence:  LowConfidence,
					Match: sgmatch.Chain{
						Actions: []*sgpb.Action{sg.Actions[2], sg.Actions[1]},
						Values: map[string][]sgmatch.ExtractedValue{
							"input": []sgmatch.ExtractedValue{{
								Resource: sgpb.Resource_builder{
									FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/foo/tests/foo_test.c")}.Build(),
								}.Build(),
							}},
						},
					},
				}}
			},
		},
		{
			desc:       "TestDataInNonTestPathNoMatch",
			ruleToTest: readTestDataInNonTestPathName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/make")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/make", "check"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/head")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/cat", "foo_test.c"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("2").AddInput(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/build/reproducible-path/foo/tests/foo_test.c")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				return builder.Build(ctx)
			},
		},
		{
			desc:       "TestGCCFromStdinMatch",
			ruleToTest: gccFromStdinName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/make")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/make", "all"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/gcc")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/gcc", "-Wall", "-x", "c", "-", "-o", "importantlib.o"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				return builder.Build(ctx)
			},
			want: func(sg *inmemory.SysGraph) []RuleMatch {
				return []RuleMatch{{
					Name:        gccFromStdinName,
					UpdateTime:  mustParseDate("2025-11-10"),
					Description: gccFromStdinDescription,
					Confidence:  ExperimentalConfidence,
					Match: sgmatch.Chain{
						Actions: []*sgpb.Action{sg.Actions[2], sg.Actions[1]},
					},
				}}
			},
		},
		{
			desc:       "TestGCCFromStdinNoMatch",
			ruleToTest: gccFromStdinName,
			graph: func(ctx context.Context) *inmemory.SysGraph {
				builder := sgstorage.SysGraphBuilder{}
				builder.Action("1").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/make")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("1").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/make", "all"}}.Build()
				builder.Action("2").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/gcc")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("2").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/gcc", "-Wall", "importantlib.c", "-o", "importantlib.o"}}.Build()
				builder.Action("2").SetParent("1", &sgpb.ActionInteraction{})
				builder.Action("3").SetExecutable(sgpb.Resource_builder{FileInfo: sgpb.FileInfo_builder{Path: new("/usr/bin/cp")}.Build()}.Build(), &sgpb.ResourceInteraction{})
				builder.Action("3").ExecInfo = sgpb.ExecInfo_builder{Argv: []string{"/usr/bin/cp", "/src/out/foo_amd64.deb", "/out/"}}.Build()
				return builder.Build(ctx)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.desc, func(t *testing.T) {
			if test.ruleToTest == "" {
				test.ruleToTest = "all"
			}
			r, err := NewRules(test.ruleToTest)
			if err != nil {
				t.Fatalf("NewRules(%q) error = %v, want nil", test.ruleToTest, err)
			}
			sg := test.graph(t.Context())
			got, err := r.Run(t.Context(), sg)
			if err != nil {
				t.Fatalf("rules.Run() error = %v, want nil", err)
			}
			opts := []cmp.Option{
				protocmp.Transform(),
				cmpopts.EquateEmpty(),
			}
			var want []RuleMatch = nil
			if test.want != nil {
				want = test.want(sg)
			}
			if diff := cmp.Diff(want, got, opts...); diff != "" {
				t.Errorf("rules.Run() diff (-want +got):\n%s", diff)
			}
		})
	}
}
