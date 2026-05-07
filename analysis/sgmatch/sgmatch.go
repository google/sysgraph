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

// Package sgmatch contains the business logic for the sgmatch tool.
package sgmatch

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"runtime/pprof"
	"slices"
	"time"

	"github.com/google/oss-rebuild/pkg/sysgraph/sgstorage"
	"github.com/google/sysgraph/analysis/rules"
	"github.com/google/sysgraph/analysis/sgoutput"
	"golang.org/x/sync/errgroup"
)

var (
	sgPath = flag.String("sg", "", "Path to sysgraph")

	output = flag.String("output", "json", "Output format. One of: terminal, json, names")

	ruleFlag = flag.String("rules", "all", "Rules to run")

	cpuprofile = flag.String("cpuprofile", "", "write cpu profile to `file`")
	memprofile = flag.String("memprofile", "", "write memory profile to `file`")
)

type graph struct {
	path string
	sg   *sgstorage.DiskSysGraph
}

// Run runs the sgmatch tool.
func Run(ctx context.Context) error {
	if err := run(ctx); err != nil {
		return fmt.Errorf("%s: %w", bin(), err)
	}
	return nil
}

func bin() string {
	if len(os.Args) == 0 {
		return "sgmatcher"
	}
	return filepath.Base(os.Args[0])
}

func run(ctx context.Context) error {
	// Write mem profile even if we hit an error.
	if *memprofile != "" {
		defer func() {
			f, err := os.Create(*memprofile)
			if err != nil {
				fmt.Fprintf(os.Stderr, "could not create memory profile: %v\n", err)
				os.Exit(1)
			}
			defer f.Close() // error handling omitted for example
			runtime.GC()    // get up-to-date statistics
			if err := pprof.WriteHeapProfile(f); err != nil {
				fmt.Fprintf(os.Stderr, "could not write memory profile: %v\n", err)
				os.Exit(1)
			}
		}()
	}

	if *cpuprofile != "" {
		f, err := os.Create(*cpuprofile)
		if err != nil {
			return fmt.Errorf("could not create CPU profile: %w", err)
		}
		defer f.Close()
		if err := pprof.StartCPUProfile(f); err != nil {
			return fmt.Errorf("could not start CPU profile: %w", err)
		}
		defer pprof.StopCPUProfile()
	}

	graphs := make(chan graph, 100)

	out, err := sgoutput.NewOutput(ctx, *output)
	if err != nil {
		return err
	}

	r, err := rules.NewRules(*ruleFlag)
	if err != nil {
		return fmt.Errorf("%v", err)
	}

	if *sgPath == "" {
		return fmt.Errorf("must provide a sysgraph path")
	}
	buildPaths := []string{*sgPath}

	eg, ctx := errgroup.WithContext(ctx)
	eg.Go(func() error {
		egInner, ctx := errgroup.WithContext(ctx)
		egInner.SetLimit(10)
		for _, buildPath := range buildPaths {
			egInner.Go(func() error {
				sg, err := sgstorage.LoadSysGraph(ctx, buildPath)
				if err != nil {
					return fmt.Errorf("failed to load sysgraph: %w", err)
				}
				graphs <- graph{path: buildPath, sg: sg}
				return nil
			})
		}
		err := egInner.Wait()
		close(graphs)
		return err
	})

	var times []time.Duration
	i := 0
	eg.Go(func() error {
		for g := range graphs {
			start := time.Now()
			i++
			// \033[K is a magic sequence that clears the current line while \r moves the cursor to the
			// start of the line. Together, they present the current status on a single, updating line.
			fmt.Fprintf(os.Stderr, "\033[KProcessing sysgraph %d/%d [%s]\r", i, len(buildPaths), g.path)
			matches, err := r.Run(ctx, g.sg)
			if err != nil {
				g.sg.Close()
				return fmt.Errorf("failed to find chains: %w", err)
			}

			// Clean up the /tmp copy to avoid exhausting disk space.
			if err := g.sg.Close(); err != nil {
				return fmt.Errorf("failed to close sysgraph: %w", err)
			}
			times = append(times, time.Since(start))
			if err := out.Write(ctx, matches, g.path); err != nil {
				return err
			}
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return err
	}
	if len(times) > 0 {
		slices.Sort(times)
		avg := time.Duration(0)
		for _, t := range times {
			avg += t
		}
		avg = avg / time.Duration(len(times))
		fmt.Fprintf(os.Stderr, "min/max/median/avg: %v/%v/%v/%v\n", times[0], times[len(times)-1], times[len(times)/2], avg)
	} else {
		fmt.Fprint(os.Stderr, "no targets\n")
	}

	return nil
}
