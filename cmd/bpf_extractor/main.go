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

// bpf_extractor converts the output of a bpftrace script into a SysGraph
package main

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"maps"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/oss-rebuild/pkg/sysgraph/sgir"
	"google.golang.org/protobuf/proto"

	sgpb "github.com/google/oss-rebuild/pkg/sysgraph/proto/sysgraph"
	tspb "google.golang.org/protobuf/types/known/timestamppb"
)

var (
	inputFile = flag.String("input_file", "", "Input file containing the json output of bpftool")
	outputDir = flag.String("output_dir", "", "Output directory to write the graph to")
)

func main() {
	flag.Parse()
	if err := mainWithErr(); err != nil {
		log.Fatalf("bpf_extractor: %v\n", err)
	}
}

type genericBPFTraceLog struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type lostEventsBPFTraceLog struct {
	Events int `json:"events"`
}

func mainWithErr() error {
	ctx := context.Background()
	r := os.Stdin
	var filesize int64 = 0
	if len(*inputFile) > 0 {
		f, err := os.Open(*inputFile)
		if err != nil {
			return fmt.Errorf("failed to open log file: %w", err)
		}
		defer f.Close()
		if stat, err := f.Stat(); err == nil {
			filesize = stat.Size()
		}
		r = f
	}
	if len(*outputDir) == 0 {
		path, err := os.MkdirTemp("", "sysgraph")
		if err != nil {
			return fmt.Errorf("failed to create sysgraph directory: %w", err)
		}
		*outputDir = path
	}
	eventDir := filepath.Join(*outputDir, "/events")
	// WriteEvents appends to existing events, so we need to clear out any
	// residual data left from previous runs.
	if err := os.RemoveAll(eventDir); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("failed to clear buildgraph events directory: %w", err)
	}
	if err := os.MkdirAll(eventDir, 0755); err != nil {
		return fmt.Errorf("failed to create sysgraph events directory: %w", err)
	}
	w := &sgir.DiskFormat{BasePath: eventDir, Format: sgir.JSONL}
	d := json.NewDecoder(r)
	p := &parser{partialActions: map[string]*action{}, partialFiles: map[string]*file{}, pidKeys: map[int64]string{}, pipesByInode: map[int64]*pipe{}}
	i := 0
	lostEvents := 0
	for d.More() {
		if filesize != 0 {
			fmt.Fprintf(os.Stderr, "\033[KProcessed %.1f%%\r", 100*float64(d.InputOffset())/float64(filesize))
		}
		i++
		line := genericBPFTraceLog{}
		if err := d.Decode(&line); err != nil {
			return fmt.Errorf("failed to decode log on line %d: %w", i, err)
		}
		if line.Type == "lost_events" {
			lostEventsLog := lostEventsBPFTraceLog{}
			if err := json.Unmarshal(line.Data, &lostEventsLog); err != nil {
				return fmt.Errorf("malformed lost_events log on line %d: %w", i, err)
			}
			lostEvents += lostEventsLog.Events
		}
		if line.Type != "printf" {
			continue
		}
		var data string
		if err := json.Unmarshal(line.Data, &data); err != nil {
			return fmt.Errorf("malformed printf log on line %d: %w", i, err)
		}
		events, err := p.parse(data)
		if err != nil {
			return fmt.Errorf("failed to parse line %d: %w", i, err)
		}
		if _, err = w.WriteEvents(ctx, events...); err != nil {
			return fmt.Errorf("failed to write events to sysgraph: %w", err)
		}
	}
	if _, err := w.WriteEvents(ctx, p.emitPipeEvents()...); err != nil {
		return fmt.Errorf("failed to write events to sysgraph: %w", err)
	}
	fmt.Fprintf(os.Stderr, "total lost_events: %d\n", lostEvents)
	return writeSysGraph(ctx, w, *outputDir)
}

type action struct {
	key     string
	builtin bool
	parent  string
	start   time.Time
	cmd     string
	wd      []string
	pid     int64
	tid     int64
	argv    []string
	envp    []string
}

type file struct {
	actionKey string
	eventType *sgpb.ResourceEvent_EventType
	start     time.Time
	path      []string
}

type pipe struct {
	readInteractions, writeInteractions map[string]time.Time
}

type pipeInteraction struct {
	execID    string
	timestamp time.Time
}

type parser struct {
	partialActions map[string]*action
	partialFiles   map[string]*file
	pipesByInode   map[int64]*pipe
	pidKeys        map[int64]string
}

func (p *parser) parse(data string) ([]*sgpb.SysGraphEvent, error) {
	fields, err := parseLine(data)
	if err != nil {
		return nil, err
	}
	if len(fields["key"]) == 0 {
		return nil, fmt.Errorf(`missing field "key"`)
	}
	if len(fields["type"]) == 0 {
		return nil, fmt.Errorf(`missing field "type"`)
	}
	typ := fields["type"]
	key, err := formatKey(fields["key"])
	if err != nil {
		return nil, err
	}
	switch typ {
	case "EXECVE":
		startNs, err := strconv.ParseInt(fields["nsec"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse start time %q: %w", fields["nsec"], err)
		}
		pid, err := strconv.ParseInt(fields["pid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse pid %q: %w", fields["pid"], err)
		}
		ppid, err := strconv.ParseInt(fields["parent_pid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse parent_pid %q: %w", fields["parent_pid"], err)
		}
		tid, err := strconv.ParseInt(fields["tid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse tid %q: %w", fields["tid"], err)
		}
		start := time.Unix(0, startNs)
		p.replacePidKey(pid, key)
		p.partialActions[key] = &action{
			key:   key,
			start: start,
			pid:   pid,
			tid:   tid,
			cmd:   fields["cmd"],
			argv:  []string{fields["cmd"]},
		}
		if pkey, ok := p.pidKeys[ppid]; ok {
			p.partialActions[key].parent = pkey
		}
	case "ARGV":
		a, ok := p.partialActions[key]
		if !ok {
			return nil, nil
		}
		// Skip for now
		if a.builtin {
			break
		}
		i, err := strconv.ParseInt(fields["index"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse argv index %q: %w", fields["index"], err)
		}
		// Strictly speaking, argv[0] is just another argument, but the tetragon logic
		// and much of our existing code assumes it will be the absolute path of the
		// executable.
		if i == 0 {
			break
		}
		a.argv = append(a.argv, fields["value"])
	case "ENVP":
		a, ok := p.partialActions[key]
		if !ok {
			return nil, nil
		}
		// TODO: Use the index field if/when we figure out how to stop dropping events.
		a.envp = append(a.envp, fields["value"])
	case "CWD":
		a, ok := p.partialActions[key]
		if !ok {
			return nil, nil
		}
		// TODO: Use the index field if/when we figure out how to stop dropping events.
		a.wd = append(a.wd, fields["value"])
	case "FORK":
		startNs, err := strconv.ParseInt(fields["nsec"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse start time %q: %w", fields["nsec"], err)
		}
		start := time.Unix(0, startNs)
		pid, err := strconv.ParseInt(fields["pid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse pid %q: %w", fields["pid"], err)
		}
		cpid, err := strconv.ParseInt(fields["child_pid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse child pid %q: %w", fields["child_pid"], err)
		}
		tid, err := strconv.ParseInt(fields["tid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse tid %q: %w", fields["tid"], err)
		}
		p.replacePidKey(cpid, key)
		p.partialActions[key] = &action{
			key:   key,
			start: start,
			pid:   cpid,
			tid:   tid,
		}
		pkey := p.pidKeys[pid]
		pa := p.partialActions[pkey]
		if pa != nil {
			p.partialActions[key].cmd = pa.cmd
			p.partialActions[key].argv = pa.argv
			p.partialActions[key].envp = pa.envp
			p.partialActions[key].wd = pa.wd
		}
		if pkey != "" {
			p.partialActions[key].parent = pkey
		}
		// We want to emit this exactly like an execve for sysgraph,
		// but there are no other records to wait for, so fall through immediately
		fallthrough
	case "EXECVE_DONE":
		a, ok := p.partialActions[key]
		if !ok {
			return nil, nil
		}
		// Make a copy since we'll reuse a.wd for FORKs
		wds := slices.Clone(a.wd)
		// Trailing slash becomes a leading slash when reversed,
		// which makes path.Join correctly produce an absolute path
		wds = append(wds, "/")
		slices.Reverse(wds)
		wd := path.Join(wds...)
		out := []*sgpb.SysGraphEvent{
			sgpb.SysGraphEvent_builder{
				ActionId:  new(key),
				Timestamp: tspb.New(a.start),
				ExecEvent: sgpb.ExecEvent_builder{
					Executable: sgpb.Resource_builder{
						FileInfo: sgpb.FileInfo_builder{
							Path: new(a.cmd),
							Type: sgpb.FileType_FILE_TYPE_REGULAR.Enum(),
						}.Build(),
					}.Build(),
					ExecInfo: sgpb.ExecInfo_builder{
						WorkingDirectory: new(wd),
						Argv:             a.argv,
						Pid:              new(a.pid),
						Tid:              new(a.tid),
					}.Build(),
				}.Build(),
			}.Build(),
			sgpb.SysGraphEvent_builder{
				ActionId:  new(key),
				Timestamp: tspb.New(a.start),
				StartEvent: sgpb.StartEvent_builder{
					Timestamp: tspb.New(a.start),
				}.Build(),
			}.Build(),
			sgpb.SysGraphEvent_builder{
				ActionId:  new(key),
				Timestamp: tspb.New(a.start),
				MetadataEvent: sgpb.MetadataEvent_builder{
					Key:   new("exec_id"),
					Value: new(key),
				}.Build(),
			}.Build(),
		}
		if a.parent != "" {
			out = append(out, sgpb.SysGraphEvent_builder{
				ActionId:  new(a.parent),
				Timestamp: tspb.New(a.start),
				ChildEvent: sgpb.ChildEvent_builder{
					ChildActionId: new(key),
				}.Build(),
			}.Build())
		}
		// typ == "FORK" also falls through to this block, but
		// we only want to do this for actual "EXECVE_DONE" events.
		if typ == "EXECVE_DONE" {
			out = append(out, sgpb.SysGraphEvent_builder{
				ActionId:  new(key),
				Timestamp: tspb.New(a.start),
				MetadataEvent: sgpb.MetadataEvent_builder{
					Key:   new("is_execve"),
					Value: new("true"),
				}.Build(),
			}.Build())
		}
		return out, nil
	case "EXIT":
		startNs, err := strconv.ParseInt(fields["nsec"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse start time %q: %w", fields["nsec"], err)
		}
		start := time.Unix(0, startNs)
		pid, err := strconv.ParseInt(fields["pid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse pid %q: %w", fields["pid"], err)
		}
		code, err := strconv.ParseInt(fields["exit_code"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse exit code %q: %w", fields["exit_code"], err)
		}
		key := p.pidKeys[pid]
		delete(p.partialActions, key)
		return []*sgpb.SysGraphEvent{
			sgpb.SysGraphEvent_builder{
				ActionId:  new(key),
				Timestamp: tspb.New(start),
				EndEvent: sgpb.EndEvent_builder{
					Timestamp: tspb.New(start),
					Status:    new(uint32(code)),
				}.Build(),
			}.Build(),
		}, nil
	case "READ", "WRITE":
		startNs, err := strconv.ParseInt(fields["nsec"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse start time %q: %w", fields["nsec"], err)
		}
		start := time.Unix(0, startNs)
		pid, err := strconv.ParseInt(fields["pid"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse pid %q: %w", fields["pid"], err)
		}
		inode, err := strconv.ParseInt(fields["inode"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("cannot parse inode %q: %w", fields["inode"], err)
		}

		var eventType *sgpb.ResourceEvent_EventType
		switch fields["type"] {
		case "READ":
			eventType = sgpb.ResourceEvent_EVENT_TYPE_INPUT.Enum()
		case "WRITE":
			eventType = sgpb.ResourceEvent_EVENT_TYPE_OUTPUT.Enum()
		}

		akey := p.pidKeys[pid]
		if akey == "" {
			return nil, nil
		}
		if !strings.HasPrefix(fields["file"], "pipe[") {
			p.partialFiles[key] = &file{
				actionKey: akey,
				eventType: eventType,
				start:     start,
			}
			return nil, nil
		}
		pi, ok := p.pipesByInode[inode]
		if !ok {
			p.pipesByInode[inode] = &pipe{readInteractions: map[string]time.Time{}, writeInteractions: map[string]time.Time{}}
			pi = p.pipesByInode[inode]
		}
		switch fields["type"] {
		case "READ":
			pi.readInteractions[akey] = minTime(pi.readInteractions[akey], start)
		case "WRITE":
			pi.writeInteractions[akey] = minTime(pi.writeInteractions[akey], start)
		}
		p.pipesByInode[inode] = pi
		return nil, nil
	case "FILENAME":
		f, ok := p.partialFiles[key]
		if !ok {
			return nil, nil
		}
		f.path = append(f.path, fields["value"])
	case "FILENAME_DONE":
		f, ok := p.partialFiles[key]
		if !ok {
			return nil, nil
		}
		if len(f.path) == 0 {
			delete(p.partialFiles, key)
			return nil, nil
		}
		pathSegments := slices.Clone(f.path)
		pathSegments = append(pathSegments, "/")
		slices.Reverse(pathSegments)
		filename := path.Join(pathSegments...)
		delete(p.partialFiles, key)
		return []*sgpb.SysGraphEvent{
			sgpb.SysGraphEvent_builder{
				ActionId:  new(f.actionKey),
				Timestamp: tspb.New(f.start),
				ResourceEvent: sgpb.ResourceEvent_builder{
					EventType: f.eventType,
					Resource: sgpb.Resource_builder{
						FileInfo: sgpb.FileInfo_builder{
							Path: new(filename),
							Type: sgpb.FileType_FILE_TYPE_REGULAR.Enum(),
						}.Build(),
					}.Build(),
				}.Build(),
			}.Build(),
		}, nil
	case "BUILTIN":
		p.partialActions[key] = &action{builtin: true}
	}
	return nil, nil
}

func minTime(a, b time.Time) time.Time {
	if !a.IsZero() && a.Before(b) {
		return a
	}
	return b
}

func collectInodePipes(readMap, writeMap map[string]time.Time) (readers, writers []pipeInteraction) {
	for execID, timestamp := range readMap {
		readers = append(readers, pipeInteraction{execID, timestamp})
	}
	for execID, timestamp := range writeMap {
		writers = append(writers, pipeInteraction{execID, timestamp})
	}
	slices.SortFunc(readers, func(a, b pipeInteraction) int {
		return a.timestamp.Compare(b.timestamp)
	})
	slices.SortFunc(writers, func(a, b pipeInteraction) int {
		return a.timestamp.Compare(b.timestamp)
	})

	return readers, writers
}

// All existing logic assumes that pipes have a single reader and a single
// writer, but this isn't correct and is violated in practice. The bpftrace
// logging config can accurately track all readers and writers of a pipe, so we
// massage that data into the expected format here.
//
// Consider the following script:
// (cat ~/foo.txt && cat ~/bar.txt) | (head -n3 && head -n5)
//
// This has a single pipe with two readers and two writers. We'll represent this
// as if it were `cat ~/foo.txt | cat ~/bar.txt | head -n3 | head -n5`. This is
// the least-bad distortion, in my opinion, because it accurately represents the
// causal order of dataflow without dropping anything, although it does
// misleadingly imply that `head -n5` is (uselessly) handling the output of
// `head -n3` when it's actually handling the leftover pipe contents.
//
// Cycles are also possible with pipes, and also poorly handled downstream,
// so we need to prune pipes in some cases. We prune the latest interaction in
// any cycle, which is somewhat arbitrary, but does tend to prune status
// feedback, which is a common pattern and comparatively less interesting than
// other pipes.
func (p *parser) emitPipeEvents() []*sgpb.SysGraphEvent {
	interactions := map[pipeInteraction]bool{}
	edges := map[pipeInteraction]pipeInteraction{}
	for _, pi := range p.pipesByInode {
		if len(pi.readInteractions) == 0 || len(pi.writeInteractions) == 0 {
			continue
		}
		readers, writers := collectInodePipes(pi.readInteractions, pi.writeInteractions)
		combined := append(writers, readers...)
		for i, writer := range combined[:len(combined)-1] {
			reader := combined[i+1]
			interactions[reader] = true
			interactions[writer] = true
			edges[writer] = reader
		}
	}
	queue := slices.Collect(maps.Keys(interactions))
	slices.SortFunc(queue, func(a, b pipeInteraction) int {
		return a.timestamp.Compare(b.timestamp)
	})

	var events []*sgpb.SysGraphEvent
	visited := map[string]bool{}
	for _, interaction := range queue {
		if visited[interaction.execID] {
			continue
		}

		curr := interaction
		for {
			visited[curr.execID] = true
			next, ok := edges[curr]
			if !ok {
				break
			}
			if visited[next.execID] {
				break
			}
			r := sgpb.Resource_builder{
				Type: sgpb.ResourceType_RESOURCE_TYPE_PIPE.Enum(),
				PipeInfo: sgpb.PipeInfo_builder{
					ReadEnd: sgpb.StdIODupInfo_builder{
						OldFd: proto.Int32(4), // dummy value
						NewFd: proto.Int32(0),
					}.Build(),
					ReadExecId: new(next.execID),
					WriteEnd: sgpb.StdIODupInfo_builder{
						OldFd: proto.Int32(5), // dummy value
						NewFd: proto.Int32(1),
					}.Build(),
					WriteExecId: new(curr.execID),
				}.Build(),
			}.Build()
			events = append(events, sgpb.SysGraphEvent_builder{
				ActionId:  new(curr.execID),
				Timestamp: tspb.New(curr.timestamp),
				ResourceEvent: sgpb.ResourceEvent_builder{
					EventType: sgpb.ResourceEvent_EVENT_TYPE_OUTPUT.Enum(),
					Resource:  r,
				}.Build(),
			}.Build())
			events = append(events, sgpb.SysGraphEvent_builder{
				ActionId:  new(next.execID),
				Timestamp: tspb.New(next.timestamp),
				ResourceEvent: sgpb.ResourceEvent_builder{
					EventType: sgpb.ResourceEvent_EVENT_TYPE_INPUT.Enum(),
					Resource:  r,
				}.Build(),
			}.Build())
			curr = next
		}
	}
	return events
}

func (p *parser) replacePidKey(pid int64, key string) {
	if old, ok := p.pidKeys[pid]; ok {
		delete(p.partialActions, old)
	}
	p.pidKeys[pid] = key

}

func parseLine(line string) (map[string]string, error) {
	pairs := map[string]string{}
	for len(line) > 0 {
		key, rest, ok := strings.Cut(line, "=")
		if !ok {
			break
		}
		key = strings.TrimSpace(key)
		var value string
		// "content" always comes last and has arbitrary binary data, so
		// special case it.
		if key == "content" {
			value, rest = rest, ""
		} else if len(rest) > 0 && rest[0] == '"' {
			rest = rest[1:]
			value, rest, ok = strings.Cut(rest, "\"")
			if !ok {
				return nil, fmt.Errorf("missing close quote for value of %q", key)
			}
		} else {
			// Ignoring ok is fine here
			value, rest, _ = strings.Cut(rest, " ")
		}
		pairs[key] = value
		line = rest
	}
	return pairs, nil
}

// formatKey converts the (nsec, pid) key used by bpftrace to a base64 string
// This format is more convenient for use in filenames and sysgraph events, but
// is impractical to produce within bpftrace due to its limited library.
func formatKey(key string) (string, error) {
	var nsec, pid uint64
	if _, err := fmt.Sscanf(key, "(%d,%d)", &nsec, &pid); err != nil {
		return "", fmt.Errorf("failed to format key %q: %w", key, err)
	}
	var buf []byte
	buf = binary.LittleEndian.AppendUint64(buf, nsec)
	buf = binary.LittleEndian.AppendUint64(buf, pid)
	return base64.URLEncoding.EncodeToString(buf), nil
}

func writeSysGraph(ctx context.Context, r sgir.Reader, path string) error {
	b := &sgir.Builder{ConcurrencyLimit: runtime.NumCPU()}
	if err := b.ToSysGraph(ctx, "", r, path); err != nil {
		return err
	}
	return nil
}
