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

// Package rules contains the rules for the sgmatcher.
package rules

import (
	"cmp"
	"context"
	"fmt"
	"maps"
	"path"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/google/oss-rebuild/pkg/sysgraph/sgmatch"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgtransform"

	sgpb "github.com/google/oss-rebuild/pkg/sysgraph/proto/sysgraph"
)

var rules = map[string]Rule{}

const (
	keesSoreThumbName             = "KeesSoreThumb"
	gccFromStdinName              = "GCCFromStdin"
	netReadName                   = "NetRead"
	readTestDataInNonTestPathName = "ReadTestDataInNonTestPath"

	keesSoreThumbDescription = "detects .o files written by untrusted binaries. " +
		".o files should typically only be written by compilers, assemblers, " +
		"and related tools (like strip)."
	nonTestPathDescription = "detects when test data is read " +
		"from a non-test path. Test data should only be read from test paths."
	netReadDescription      = "catches reads from the network during builds."
	gccFromStdinDescription = "detects gcc calls that take input from stdin."
)

func mustParseDate(value string) time.Time {
	t, err := time.Parse(time.DateOnly, value)
	if err != nil {
		panic(err)
	}
	return t
}

func init() {
	RegisterRule(Rule{
		Name:        keesSoreThumbName,
		UpdateTime:  mustParseDate("2025-11-10"),
		Confidence:  HighConfidence,
		Description: keesSoreThumbDescription,
		Matcher: sgmatch.Edges{
			sgmatch.AllActions(
				sgmatch.ActionWithAll(
					sgmatch.ActionOutput(
						sgmatch.ExtractResource("output",
							sgmatch.ResourcePathRegexp(regexp.MustCompile(`^/.*\.o$`)),
						),
					),
					nonTrustedExecutable,
				),
			),
			sgmatch.ActionToAllAncestorsTraversal(nonTrustedExecutable),
		},
	})
	RegisterRule(Rule{
		Name:        readTestDataInNonTestPathName,
		UpdateTime:  mustParseDate("2025-08-01"),
		Confidence:  LowConfidence,
		Description: nonTestPathDescription,
		Matcher: sgmatch.Edges{
			sgmatch.AllActions(
				sgmatch.ActionWithAll(
					sgmatch.ActionInput(sgmatch.ExtractResource("input", sgmatch.ResourcePathRegexp(testFilePath))),
					sgmatch.ActionWithNone(testCommand),
				),
			),
			sgmatch.ActionToAllAncestorsTraversal(sgmatch.ActionWithNone(testCommand)),
		},
	})
	RegisterRule(Rule{
		Name:        netReadName,
		UpdateTime:  mustParseDate("2025-08-01"),
		Confidence:  HighConfidence,
		Description: netReadDescription,
		Matcher: sgmatch.Edges{
			sgmatch.AllActions(
				sgmatch.ActionWithAny(
					sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/curl")),
					sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/wget")),
				),
			),
		},
	})
	RegisterRule(Rule{
		Name:        gccFromStdinName,
		UpdateTime:  mustParseDate("2025-11-10"),
		Confidence:  ExperimentalConfidence,
		Description: gccFromStdinDescription,
		Matcher: sgmatch.Edges{
			sgmatch.AllActions(
				sgmatch.ActionWithAll(
					sgmatch.ActionExecutable(sgmatch.ResourcePathRegexp(regexp.MustCompile(`^(/+usr)?/+s?bin/+(.*-)?gcc`))),
					sgmatch.ActionFunc(func(_ context.Context, _ sgtransform.SysGraph, a *sgpb.Action) (bool, error) {
						setsLang := false
						readsStdin := false
						for _, arg := range a.GetExecInfo().GetArgv()[1:] {
							switch arg {
							case "-":
								readsStdin = true
							case "-x":
								setsLang = true
							}
							if setsLang && readsStdin {
								return true, nil
							}
						}
						return false, nil
					}),
				),
			),
			sgmatch.ActionToAllAncestorsTraversal(nonTrustedExecutable),
		},
	})
}

// RegisterRule registers a rule for use with sysgraph matching. This allows
// consumers to register additional, experimental rules that aren't ready for
// inclusion in the package.
func RegisterRule(r Rule) {
	rules[r.Name] = r
}

var trustedExecutableRegexp = regexp.MustCompile(`^(/+usr)?/+s?bin/+(.*-)?(gcc|g\+\+|cc|c\+\+|clang(-\d+)?|as|.?asm|strip|ld|ld\.gold|ld\.bfd|cp|mv|asmc|objcopy|rustc|bpftool|ldc|gdc|dmd|install|go|ldc2|ppcx64|ispc|ar)$`)

var nonTrustedExecutable = sgmatch.ActionWithNone(
	sgmatch.ActionExecutable(sgmatch.ResourcePathRegexp(trustedExecutableRegexp)),
	// libtool is a script. I don't know if there's a good way to verify that this
	// is invoking the real libtool, rather than a malicious script.
	sgmatch.ActionWithAll(
		sgmatch.ActionExecutable(sgmatch.ResourcePathRegexp(regexp.MustCompile(`^/bin/(ba)?sh$`))),
		sgmatch.ActionFunc(func(_ context.Context, _ sgtransform.SysGraph, a *sgpb.Action) (bool, error) {
			for _, arg := range a.GetExecInfo().GetArgv() {
				if path.Base(arg) == "libtool" {
					return true, nil
				}
			}
			return false, nil
		}),
	),
)

var testCommand = sgmatch.ActionWithAny(
	sgmatch.ActionWithAll(
		sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/make")),
		sgmatch.ActionFunc(func(_ context.Context, _ sgtransform.SysGraph, a *sgpb.Action) (bool, error) {
			for _, arg := range a.GetExecInfo().GetArgv() {
				arg := strings.ToLower(arg)
				if strings.Contains(arg, "check") || strings.Contains(arg, "test") || strings.Contains(arg, "clean") {
					return true, nil
				}
			}
			return false, nil
		}),
	),
	sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/dh_clean")),
	sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/dh_autoreconf")),
	sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/dh_auto_configure")),
	sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/dh_update_autotools_config")),
	sgmatch.ActionWithAll(
		sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/dpkg-source")),
		sgmatch.ActionWithAny(
			sgmatch.ActionArgvContains("--before-build"),
			sgmatch.ActionArgvContains("--after-build"),
		),
	),
	// I'm not totally sure why, but these show up outside test trees. They're safe, though
	sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/rm")),
	sgmatch.ActionExecutable(sgmatch.ResourcePath("/usr/bin/chmod")),
)

var testFilePath = regexp.MustCompile(`^/.*/[^/]*test(s?)[^/]*/`)

// Confidence indicates how likely we believe that matches for a rule
// indicate legitimately anomalous behavior.
type Confidence string

const (
	// ExperimentalConfidence indicates that the rule is experimental, and
	// matches should not be relied on.
	ExperimentalConfidence Confidence = "Experimental"
	// LowConfidence indicates that the rule is known to have many false positives.
	// Such rules are useful as a measure of a build's "hygiene", but should not
	// be seen as a direct indicator of security problems.
	LowConfidence Confidence = "Low"
	// HighConfidence indicates that the rule is known to have few false positives.
	// We expect any matches for to be worth investigation.
	HighConfidence Confidence = "High"
)

// CompareConfidence compares two confidence levels by their score.
func CompareConfidence(a, b string) int {
	return cmp.Compare(numConfidence(Confidence(a)), numConfidence(Confidence(b)))
}

// Rule is a rule for the sgmatcher.
type Rule struct {
	Name          string
	UpdateTime    time.Time
	Description   string
	Confidence    Confidence
	Matcher       sgmatch.Edges
	MatchIfAbsent bool
}

// RuleMatch is a rule match.
type RuleMatch struct {
	Name        string
	UpdateTime  time.Time
	Description string
	Confidence  Confidence
	Match       sgmatch.Chain
}

// Rules is a collection of rules to use for matching.
type Rules []Rule

// NewRules creates a rule collection based on the spec provided. The spec
// should be a comma-separated list of rule names to include, or the string
// "all", indicating that all registered rules should be used.
func NewRules(spec string) (Rules, error) {
	var rs Rules
	for ruleSpec := range strings.SplitSeq(spec, ",") {
		if ruleSpec == "all" {
			return slices.Collect(maps.Values(rules)), nil
		}
		r, ok := rules[ruleSpec]
		if !ok {
			return nil, fmt.Errorf("rule %q not found", ruleSpec)
		}
		rs = append(rs, r)
	}
	slices.SortFunc(rs, func(a, b Rule) int {
		return cmp.Or(
			cmp.Compare(numConfidence(a.Confidence), numConfidence(b.Confidence)),
			cmp.Compare(a.Name, b.Name),
		)

	})
	return rs, nil
}

// Run evaluates the rules on the given sysgraph.
func (r Rules) Run(ctx context.Context, sg sgtransform.SysGraph) ([]RuleMatch, error) {
	var matches []RuleMatch
	for _, rule := range r {
		chains, err := rule.Matcher.AllChains(ctx, sg)
		if err != nil {
			return nil, err
		}

		found := len(chains) > 0
		if rule.MatchIfAbsent {
			if !found {
				matches = append(matches, RuleMatch{
					Name:        rule.Name,
					UpdateTime:  rule.UpdateTime,
					Description: rule.Description,
					Confidence:  rule.Confidence,
				})
			}
		} else {
			for _, chain := range chains {
				matches = append(matches, RuleMatch{
					Name:        rule.Name,
					UpdateTime:  rule.UpdateTime,
					Description: rule.Description,
					Confidence:  rule.Confidence,
					Match:       chain,
				})
			}
		}
	}
	slices.SortFunc(matches, func(a, b RuleMatch) int {
		return cmp.Or(
			cmp.Compare(numConfidence(a.Confidence), numConfidence(b.Confidence)),
			cmp.Compare(a.Name, b.Name),
		)

	})
	return matches, nil
}

func numConfidence(c Confidence) int {
	switch c {
	case HighConfidence:
		return 0
	case LowConfidence:
		return 1
	case ExperimentalConfidence:
		return 2
	default:
		return 100
	}
}

// LastUpdate returns the latest update time for any of the rules in the collection.
func (r Rules) LastUpdate() time.Time {
	var latest time.Time
	for _, rule := range r {
		if rule.UpdateTime.After(latest) {
			latest = rule.UpdateTime
		}
	}
	return latest
}
