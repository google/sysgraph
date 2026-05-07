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

package sgoutput

import (
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgmatch"
	"google.golang.org/protobuf/proto"

	"github.com/google/sysgraph/analysis/rules"

	sgpb "github.com/google/oss-rebuild/pkg/sysgraph/proto/sysgraph"
)

func TestOutput(t *testing.T) {
	rs := []rules.RuleMatch{{
		Name:        "KeesSoreThumb",
		Description: "A description",
		Confidence:  rules.HighConfidence,
		Match: sgmatch.Chain{
			Actions: []*sgpb.Action{
				sgpb.Action_builder{Id: proto.Int64(1), ExecInfo: sgpb.ExecInfo_builder{
					Argv: []string{"/bin/bash"},
				}.Build()}.Build(),
				sgpb.Action_builder{Id: proto.Int64(2), ExecInfo: sgpb.ExecInfo_builder{
					Argv: []string{"/usr/bin/cat", "foo.txt"},
				}.Build()}.Build(),
			},
			Values: map[string][]sgmatch.ExtractedValue{
				"output": []sgmatch.ExtractedValue{{
					Resource: sgpb.Resource_builder{
						FileInfo: sgpb.FileInfo_builder{Path: new("/some/path")}.Build(),
					}.Build(),
				}},
			},
		},
	}, {
		Name:        "KeesSorePinky",
		Description: "A different description",
		Confidence:  rules.LowConfidence,
		Match: sgmatch.Chain{
			Actions: []*sgpb.Action{
				sgpb.Action_builder{Id: proto.Int64(3), ExecInfo: sgpb.ExecInfo_builder{
					Argv: []string{"/usr/bin/cat", "bar.txt"},
				}.Build()}.Build(),
			},
			Values: map[string][]sgmatch.ExtractedValue{},
		},
	}}
	tests := []struct {
		name    string
		outType string
		want    string
	}{
		{
			name:    "TestNames",
			outType: "names",
			want:    "Matches for /my/path: KeesSorePinky: 1 KeesSoreThumb: 1",
		},
		{
			name:    "TestTerminal",
			outType: "terminal",
			want: `For sysgraph /my/path:
[2] /usr/bin/cat foo.txt
  [1] /bin/bash
Matched files:
output:
/some/path
[3] /usr/bin/cat bar.txt
Matched files:`,
		},
		{
			name:    "TestJSON",
			outType: "json",
			want: `[
  {
    "rule_name": "KeesSoreThumb",
    "description": "A description",
    "confidence": "High",
    "path": "/my/path",
    "action_id_chain": [
      1,
      2
    ],
    "resources": [
      "/some/path"
    ]
  },
  {
    "rule_name": "KeesSorePinky",
    "description": "A different description",
    "confidence": "Low",
    "path": "/my/path",
    "action_id_chain": [
      3
    ],
    "resources": []
  }
]`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			buf := &strings.Builder{}
			stdout = buf
			o, err := NewOutput(t.Context(), test.outType)
			if err != nil {
				t.Fatalf("NewOutput(%q) error = %v", test.outType, err)
			}
			if to, ok := o.(*terminalOutput); ok {
				to.width = 80
			}
			if err := o.Write(t.Context(), rs, "/my/path"); err != nil {
				t.Fatalf("Write() error = %v", err)
			}
			got := strings.TrimSpace(buf.String())
			if diff := cmp.Diff(test.want, got); diff != "" {
				t.Errorf("Unexpected diff (-want +got):\n%s", diff)
			}
		})
	}
}
