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

package main

import (
	"flag"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/google/oss-rebuild/pkg/sysgraph/pbdigest"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgstorage"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/testing/protocmp"

	sgpb "github.com/google/oss-rebuild/pkg/sysgraph/proto/sysgraph"
	tspb "google.golang.org/protobuf/types/known/timestamppb"
)

// Logs representing the following execution:
// pid 1: /bin/other
// pid 1: /bin/bash (reuse of pid 1)
// pid 2: /usr/bin/cat (child of /bin/bash)
// cat reads from /foo.txt
var logs = []byte(`{"type": "attached_probes", "data": {"probes": 84}}
{"type": "printf", "data": "key=(111,1) type=EXECVE nsec=111 pid=1 parent_pid=0 tid=1 cmd=/bin/other"}
{"type": "printf", "data": "key=(111,1) type=CWD index=0 value=\"root\""}
{"type": "printf", "data": "key=(111,1) type=EXECVE_DONE nsec=111 pid=1"}
{"type": "printf", "data": "key=(123,1) type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash"}
{"type": "printf", "data": "key=(123,1) type=CWD index=0 value=\"user\""}
{"type": "printf", "data": "key=(123,1) type=CWD index=1 value=\"home\""}
{"type": "printf", "data": "key=(123,1) type=ARGV nsec=123 pid=1 index=0 value=\"bash\""}
{"type": "printf", "data": "key=(123,1) type=ARGV nsec=123 pid=1 index=1 value=\"exit\""}
{"type": "printf", "data": "key=(123,1) type=ENVP nsec=123 pid=1 index=1 value=\"PATH=/bin\""}
{"type": "printf", "data": "key=(123,1) type=EXECVE_DONE nsec=123 pid=1"}
{"type": "printf", "data": "key=(234,1) type=FORK nsec=234 pid=1 child_pid=2 tid=1"}
{"type": "printf", "data": "key=(456,2) type=EXECVE nsec=456 pid=2 parent_pid=1 tid=2 wd=basename cmd=/usr/bin/cat"}
{"type": "printf", "data": "key=(456,2) type=ARGV nsec=456 pid=2 index=0 value=\"cat\""}
{"type": "printf", "data": "key=(456,2) type=ARGV nsec=456 pid=2 index=1 value=\"foo.txt\""}
{"type": "printf", "data": "key=(456,2) type=EXECVE_DONE nsec=456 pid=2"}
{"type": "printf", "data": "key=(456,2) type=READ nsec=456 pid=2 inode=12345 file=/foo.txt"}
{"type": "printf", "data": "key=(456,2) type=FILENAME index=0 value=\"foo.txt\""}
{"type": "printf", "data": "key=(456,2) type=FILENAME index=1 value=\"user\""}
{"type": "printf", "data": "key=(456,2) type=FILENAME index=2 value=\"home\""}
{"type": "printf", "data": "key=(456,2) type=FILENAME_DONE"}
{"type": "printf", "data": "key=(789,1) type=EXIT nsec=789 pid=1 exit_code=0"}
{"type": "lost_events", "data": {"events": 10}}
{"type": "lost_events", "data": {"events": 11}}
`)

func TestMainWithErr(t *testing.T) {
	tracePath := filepath.Join(t.TempDir(), "trace.json")
	graphPath := filepath.Join(t.TempDir(), "graph")
	if err := os.WriteFile(tracePath, logs, 0755); err != nil {
		t.Fatalf("failed to write logs to file: %v", err)
	}

	flag.Set("input_file", tracePath)
	flag.Set("output_dir", graphPath)

	if err := mainWithErr(); err != nil {
		t.Fatalf("mainWithErr() error = %v, want nil", err)
	}
	sg, err := sgstorage.LoadSysGraph(t.Context(), graphPath)
	if err != nil {
		t.Fatalf("failed to load sysgraph: %v", err)
	}
	pidOneCount := 0
	aids, err := sg.ActionIDs(t.Context())
	if err != nil {
		t.Fatalf("failed to list actions IDs: %v", err)
	}
	for _, aid := range aids {
		a, err := sg.Action(t.Context(), aid)
		if err != nil {
			t.Fatalf("failed to load action: %v", err)
		}
		if a.GetExecInfo().GetPid() == 1 {
			pidOneCount++
		}
		if a.GetExecInfo().GetArgv()[0] == "/usr/bin/cat" {
			p, err := sg.Action(t.Context(), a.GetParentActionId())
			if err != nil {
				t.Fatalf("failed to load parent action: %v", err)
			}
			if p.GetExecInfo().GetArgv()[0] != "/bin/bash" {
				t.Errorf("parent of /usr/bin/cat was %q, want /bin/bash", p.GetExecInfo().GetArgv()[0])
			}
			ins := a.GetInputs()
			if len(ins) != 1 {
				t.Errorf("/usr/bin/cat had %d inputs, want 1", len(ins))
			}
			dg, err := pbdigest.NewFromString(slices.Collect(maps.Keys(ins))[0])
			if err != nil {
				t.Fatalf("failed to get digest for input: %v", err)
			}
			r, err := sg.Resource(t.Context(), dg)
			if err != nil {
				t.Fatalf("failed to get resource for input: %v", err)
			}
			if r.GetFileInfo().GetPath() != "/home/user/foo.txt" {
				t.Errorf("/usr/bin/cat had %q as its input, want /home/user/foo.txt", r.GetFileInfo().GetPath())
			}
		}
	}
	if pidOneCount != 2 {
		t.Errorf("Got %d actions with process ID 1, want 2", pidOneCount)
	}
}

// TestParseSkips tests that the parser skips over certain incomplete/invalid
// lines without producing an error.
func TestParseSkips(t *testing.T) {
	tests := []struct {
		name  string
		lines []string
		want  []*sgpb.SysGraphEvent
	}{
		{
			name: "IncompleteEXECVE",
			lines: []string{
				`key=(123,456) type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash`,
				`key=(123,456) type=CWD nsec=123 pid=1 index=0 value="user"`,
				`key=(123,456) type=CWD nsec=123 pid=1 index=1 value="home"`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=0 value="bash"`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=1 value="exit"`,
				`key=(123,456) type=ENVP nsec=123 pid=1 index=1 value="PATH=/bin"`,
			},
		},
		{
			name: "SkipBUILTIN",
			lines: []string{
				`key=(123,456) type=BUILTIN nsec=123 pid=1 parent_pid=0 tid=1 wd=basename builtin=echo_builtin`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=0 value="hello"`,
			},
		},
		{
			name: "OrphanedARGV",
			lines: []string{
				`key=(123,456) type=ARGV nsec=123 pid=1 index=0 value="bash"`,
			},
		},
		{
			name: "OrphanedENVP",
			lines: []string{
				`key=(123,456) type=ENVP nsec=123 pid=1 index=1 value="PATH=/bin"`,
			},
		},
		{
			name: "OrphanedEXECVE_DONE",
			lines: []string{
				`key=(123,456) type=EXECVE_DONE nsec=123 pid=1 index=1 value="PATH=/bin"`,
			},
		},
		{
			name: "SingleCompleteEXECVE",
			lines: []string{
				`key=(123,456) type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 cmd=/bin/bash`,
				`key=(123,456) type=CWD nsec=123 pid=1 index=0 value="user"`,
				`key=(123,456) type=CWD nsec=123 pid=1 index=1 value="home"`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=0 value="bash"`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=1 value="exit"`,
				`key=(123,456) type=ENVP nsec=123 pid=1 index=1 value="PATH=/bin"`,
				`key=(123,456) type=EXECVE_DONE nsec=123 pid=1 index=1 value="PATH=/bin"`,
			},
			want: []*sgpb.SysGraphEvent{
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					ExecEvent: sgpb.ExecEvent_builder{
						Executable: sgpb.Resource_builder{
							FileInfo: sgpb.FileInfo_builder{
								Path: new("/bin/bash"),
								Type: sgpb.FileType_FILE_TYPE_REGULAR.Enum(),
							}.Build(),
						}.Build(),
						ExecInfo: sgpb.ExecInfo_builder{
							WorkingDirectory: new("/home/user"),
							Argv:             []string{"/bin/bash", "exit"},
							Pid:              proto.Int64(1),
							Tid:              proto.Int64(1),
						}.Build(),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					StartEvent: sgpb.StartEvent_builder{
						Timestamp: tspb.New(time.Unix(0, 123)),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("exec_id"),
						Value: new(mustFormatKey(t, "(123,456)")),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("is_execve"),
						Value: new("true"),
					}.Build(),
				}.Build(),
			},
		},
		{
			name: "EXECVEWithEXIT",
			lines: []string{
				`key=(123,456) type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash`,
				`key=(123,456) type=CWD nsec=123 pid=1 index=0 value="user"`,
				`key=(123,456) type=CWD nsec=123 pid=1 index=1 value="home"`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=0 value="bash"`,
				`key=(123,456) type=ARGV nsec=123 pid=1 index=1 value="exit"`,
				`key=(123,456) type=ENVP nsec=123 pid=1 index=1 value="PATH=/bin"`,
				`key=(123,456) type=EXECVE_DONE nsec=123 pid=1 index=1 value="PATH=/bin"`,
				`key=(123,456) type=EXIT nsec=123 pid=1 exit_code=0`,
			},
			want: []*sgpb.SysGraphEvent{
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					ExecEvent: sgpb.ExecEvent_builder{
						Executable: sgpb.Resource_builder{
							FileInfo: sgpb.FileInfo_builder{
								Path: new("/bin/bash"),
								Type: sgpb.FileType_FILE_TYPE_REGULAR.Enum(),
							}.Build(),
						}.Build(),
						ExecInfo: sgpb.ExecInfo_builder{
							WorkingDirectory: new("/home/user"),
							Argv:             []string{"/bin/bash", "exit"},
							Pid:              proto.Int64(1),
							Tid:              proto.Int64(1),
						}.Build(),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					StartEvent: sgpb.StartEvent_builder{
						Timestamp: tspb.New(time.Unix(0, 123)),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("exec_id"),
						Value: new(mustFormatKey(t, "(123,456)")),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("is_execve"),
						Value: new("true"),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,456)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					EndEvent: sgpb.EndEvent_builder{
						Timestamp: tspb.New(time.Unix(0, 123)),
						Status:    proto.Uint32(0),
					}.Build(),
				}.Build(),
			},
		},
		{
			name: "SimplePipe",
			lines: []string{
				`key=(123,1) type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 cmd=/usr/bin/cat`,
				`key=(123,1) type=CWD nsec=123 pid=1 index=0 value="user"`,
				`key=(123,1) type=CWD nsec=123 pid=1 index=1 value="home"`,
				`key=(123,1) type=ARGV nsec=123 pid=1 index=0 value="cat"`,
				`key=(123,1) type=ARGV nsec=123 pid=1 index=1 value="hello.txt"`,
				`key=(123,1) type=ENVP nsec=123 pid=1 index=1 value="PATH=/usr/bin"`,
				`key=(123,1) type=EXECVE_DONE nsec=123 pid=1`,
				`key=(123,2) type=EXECVE nsec=123 pid=2 parent_pid=0 tid=1 cmd=/usr/bin/grep`,
				`key=(123,2) type=CWD nsec=123 pid=2 index=0 value="user"`,
				`key=(123,2) type=CWD nsec=123 pid=2 index=1 value="home"`,
				`key=(123,2) type=ARGV nsec=123 pid=2 index=0 value="grep"`,
				`key=(123,2) type=ARGV nsec=123 pid=2 index=1 value="hello"`,
				`key=(123,2) type=ENVP nsec=123 pid=2 index=1 value="PATH=/usr/bin"`,
				`key=(123,2) type=EXECVE_DONE nsec=123 pid=2`,
				`key=(123,1) type=WRITE nsec=123 pid=1 inode=321 file="pipe[321]"`,
				`key=(124,2) type=READ nsec=124 pid=2 inode=321 file="pipe[321]"`,
			},
			want: []*sgpb.SysGraphEvent{
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,1)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					ExecEvent: sgpb.ExecEvent_builder{
						Executable: sgpb.Resource_builder{
							FileInfo: sgpb.FileInfo_builder{
								Path: new("/usr/bin/cat"),
								Type: sgpb.FileType_FILE_TYPE_REGULAR.Enum(),
							}.Build(),
						}.Build(),
						ExecInfo: sgpb.ExecInfo_builder{
							WorkingDirectory: new("/home/user"),
							Argv:             []string{"/usr/bin/cat", "hello.txt"},
							Pid:              proto.Int64(1),
							Tid:              proto.Int64(1),
						}.Build(),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,1)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					StartEvent: sgpb.StartEvent_builder{
						Timestamp: tspb.New(time.Unix(0, 123)),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,1)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("exec_id"),
						Value: new(mustFormatKey(t, "(123,1)")),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,1)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("is_execve"),
						Value: new("true"),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,2)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					ExecEvent: sgpb.ExecEvent_builder{
						Executable: sgpb.Resource_builder{
							FileInfo: sgpb.FileInfo_builder{
								Path: new("/usr/bin/grep"),
								Type: sgpb.FileType_FILE_TYPE_REGULAR.Enum(),
							}.Build(),
						}.Build(),
						ExecInfo: sgpb.ExecInfo_builder{
							WorkingDirectory: new("/home/user"),
							Argv:             []string{"/usr/bin/grep", "hello"},
							Pid:              proto.Int64(2),
							Tid:              proto.Int64(1),
						}.Build(),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,2)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					StartEvent: sgpb.StartEvent_builder{
						Timestamp: tspb.New(time.Unix(0, 123)),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,2)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("exec_id"),
						Value: new(mustFormatKey(t, "(123,2)")),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,2)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					MetadataEvent: sgpb.MetadataEvent_builder{
						Key:   new("is_execve"),
						Value: new("true"),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,1)")),
					Timestamp: tspb.New(time.Unix(0, 123)),
					ResourceEvent: sgpb.ResourceEvent_builder{
						EventType: sgpb.ResourceEvent_EVENT_TYPE_OUTPUT.Enum(),
						Resource: sgpb.Resource_builder{
							Type: sgpb.ResourceType_RESOURCE_TYPE_PIPE.Enum(),
							PipeInfo: sgpb.PipeInfo_builder{
								ReadEnd: sgpb.StdIODupInfo_builder{
									OldFd: proto.Int32(4),
									NewFd: proto.Int32(0),
								}.Build(),
								ReadExecId: new(mustFormatKey(t, "(123,2)")),
								WriteEnd: sgpb.StdIODupInfo_builder{
									OldFd: proto.Int32(5),
									NewFd: proto.Int32(1),
								}.Build(),
								WriteExecId: new(mustFormatKey(t, "(123,1)")),
							}.Build(),
						}.Build(),
					}.Build(),
				}.Build(),
				sgpb.SysGraphEvent_builder{
					ActionId:  new(mustFormatKey(t, "(123,2)")),
					Timestamp: tspb.New(time.Unix(0, 124)),
					ResourceEvent: sgpb.ResourceEvent_builder{
						EventType: sgpb.ResourceEvent_EVENT_TYPE_INPUT.Enum(),
						Resource: sgpb.Resource_builder{
							Type: sgpb.ResourceType_RESOURCE_TYPE_PIPE.Enum(),
							PipeInfo: sgpb.PipeInfo_builder{
								ReadEnd: sgpb.StdIODupInfo_builder{
									OldFd: proto.Int32(4),
									NewFd: proto.Int32(0),
								}.Build(),
								ReadExecId: new(mustFormatKey(t, "(123,2)")),
								WriteEnd: sgpb.StdIODupInfo_builder{
									OldFd: proto.Int32(5),
									NewFd: proto.Int32(1),
								}.Build(),
								WriteExecId: new(mustFormatKey(t, "(123,1)")),
							}.Build(),
						}.Build(),
					}.Build(),
				}.Build(),
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var got []*sgpb.SysGraphEvent
			p := &parser{partialActions: map[string]*action{}, pidKeys: map[int64]string{}, pipesByInode: map[int64]*pipe{}}
			for _, line := range test.lines {
				events, err := p.parse(line)
				if err != nil {
					t.Fatalf("p.parse(%q) returned an unexpected error: %v", line, err)
				}
				got = append(got, events...)
			}
			got = append(got, p.emitPipeEvents()...)
			if diff := cmp.Diff(test.want, got, protocmp.Transform()); diff != "" {
				t.Errorf("p.parse(%q) returned an unexpected diff (-want +got):\n%v", test.lines, diff)
			}
		})
	}
}

func TestParseErrors(t *testing.T) {
	tests := []struct {
		name           string
		line           string
		partialActions map[string]*action
		pidKeys        map[int64]string
	}{
		{
			name: "MalformedLine",
			line: "value=\"not closed",
		},
		{
			name: "MissingKey",
			line: "type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash",
		},
		{
			name: "MalformedKey",
			line: "key=malformed type=EXECVE nsec=123 pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash",
		},
		{
			name: "MissingType",
			line: "key=(123,456) nsec=123 pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash",
		},
		{
			name: "EXECVE:BadNsec",
			line: "key=(123,456) type=EXECVE nsec=foo pid=1 parent_pid=0 tid=1 wd=basename cmd=/bin/bash",
		},
		{
			name: "EXECVE:BadPid",
			line: "key=(123,456) type=EXECVE nsec=123 pid=foo parent_pid=0 tid=1 wd=basename cmd=/bin/bash",
		},
		{
			name: "EXECVE:BadPPid",
			line: "key=(123,456) type=EXECVE nsec=123 pid=1 parent_pid=foo tid=1 wd=basename cmd=/bin/bash",
		},
		{
			name: "EXECVE:BadTid",
			line: "key=(123,456) type=EXECVE nsec=123 pid=1 parent_pid=0 tid=foo wd=basename cmd=/bin/bash",
		},
		{
			name: "ARGV:BadIndex",
			line: "key=(123,456) type=ARGV index=foo value=cat",
			partialActions: map[string]*action{
				mustFormatKey(t, "(123,456)"): {},
			},
		},
		{
			name: "FORK:BadNsec",
			line: "key=(123,456) type=FORK nsec=foo pid=1 parent_pid=0 tid=1",
		},
		{
			name: "FORK:BadPid",
			line: "key=(123,456) type=FORK nsec=123 pid=foo parent_pid=0 tid=1",
		},
		{
			name: "FORK:BadChildPid",
			line: "key=(123,456) type=FORK nsec=123 pid=1 child_pid=foo tid=1",
		},
		{
			name: "FORK:BadTid",
			line: "key=(123,456) type=FORK nsec=123 pid=1 child_pid=0 tid=foo",
		},
		{
			name: "EXIT:BadNsec",
			line: "key=(123,456) type=EXIT nsec=foo pid=1 exit_code=0",
		},
		{
			name: "EXIT:BadPid",
			line: "key=(123,456) type=EXIT nsec=123 pid=foo exit_code=0",
		},
		{
			name: "EXIT:BadExitCode",
			line: "key=(123,456) type=EXIT nsec=123 pid=1 exit_code=foo",
		},
		{
			name: "READ:BadNsec",
			line: "key=(123,456) type=READ nsec=foo pid=1 file=hello.txt",
		},
		{
			name: "READ:BadPid",
			line: "key=(123,456) type=READ nsec=123 pid=foo file=hello.txt",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			p := &parser{partialActions: map[string]*action{}, pidKeys: map[int64]string{}}
			if test.partialActions != nil {
				p.partialActions = test.partialActions
			}
			if test.pidKeys != nil {
				p.pidKeys = test.pidKeys
			}
			_, err := p.parse(test.line)
			if err == nil {
				t.Fatalf("p.parse(%q) error = nil, want non-nil", test.line)
			}
		})
	}
}

func TestParseLine(t *testing.T) {
	tests := []struct {
		line    string
		want    map[string]string
		wantErr bool
	}{
		{
			line: `k1=v1 k2=v2`,
			want: map[string]string{
				"k1": "v1",
				"k2": "v2",
			},
		},
		{
			line: `k1="a long, quoted value" k2=v2`,
			want: map[string]string{
				"k1": "a long, quoted value",
				"k2": "v2",
			},
		},
		{
			line:    `k1=v1 k2="missing close quote`,
			wantErr: true,
		},
		{
			line: `k1=v1 content="content is a special case`,
			want: map[string]string{
				"k1":      "v1",
				"content": "\"content is a special case",
			},
		},
		{
			line: `      `,
		},
	}

	for _, test := range tests {
		got, err := parseLine(test.line)
		if test.wantErr != (err != nil) {
			t.Errorf("parseLine(%q) error = %v, wantErr %t", test.line, err, test.wantErr)
		}
		if diff := cmp.Diff(test.want, got, cmpopts.EquateEmpty()); diff != "" {
			t.Errorf("parseLine(%q) returned an unexpected diff (-want +got):\n%v", test.line, diff)
		}
	}
}

func TestFormatKey(t *testing.T) {
	key := "(123,456)"
	got, err := formatKey(key)
	if err != nil {
		t.Fatalf("formatKey(%q) error = %v, want nil", key, err)
	}
	want := "ewAAAAAAAADIAQAAAAAAAA=="
	if got != want {
		t.Errorf("formatKey(%q) = %q, want %q", key, got, want)
	}
}

func TestFormatKeyMalformed(t *testing.T) {
	key := "malformed"
	if _, err := formatKey(key); err == nil {
		t.Fatalf("formatKey(%q) error = nil, want non-nil", key)
	}
}

func mustFormatKey(t *testing.T, key string) string {
	t.Helper()
	k, err := formatKey(key)
	if err != nil {
		t.Fatalf("formatKey(%q) returned an unexpected error: %v", key, err)
	}
	return k
}
