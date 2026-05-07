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

// Package main is the main package for the sysgraph playground.
package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"

	log "github.com/golang/glog"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgstorage"
	"github.com/google/oss-rebuild/pkg/sysgraph/sgtransform"
	"github.com/google/safehtml"
	"github.com/google/safehtml/template"
	"github.com/google/sysgraph/playground/precompute"
	"golang.org/x/sync/errgroup"

	_ "embed"
)

const templatesPathGlob = "cmd/playground_server/templates/*.html"

var (
	//go:embed embed/demo.css
	demoCSS []byte
	//go:embed embed/demo.css.gz
	demoCSSGz []byte
	//go:embed embed/ui/playground_app.js
	demoJS []byte
	//go:embed embed/ui/playground_app.js.gz
	demoJSGz []byte
	//go:embed embed/ui/playground_app.js.map
	demoSourceMap []byte
	//go:embed embed/ui/playground_app.js.map.gz
	demoSourceMapGz []byte

	demoCSSPath       safehtml.TrustedResourceURL
	demoJSPath        safehtml.TrustedResourceURL
	demoSourceMapPath safehtml.TrustedResourceURL
)

func mustInitStaticFiles(ctx context.Context) {
	cssHash := sha256.Sum256(demoCSS)
	smapHash := sha256.Sum256(demoSourceMap)
	var err error
	cssParams := map[string]string{"hash": hex.EncodeToString(cssHash[:])}
	demoCSSPath, err = safehtml.TrustedResourceURLFormatFromConstant("/demo-%{hash}.css", cssParams)
	if err != nil {
		log.FatalContextf(ctx, "Failed to create CSS path: %v", err)
	}
	smapParams := map[string]string{"hash": hex.EncodeToString(smapHash[:])}
	demoSourceMapPath, err = safehtml.TrustedResourceURLFormatFromConstant("/demo-%{hash}.sourcemap", smapParams)
	if err != nil {
		log.FatalContextf(ctx, "Failed to create sourcemap path: %v", err)
	}

	demoJS = fmt.Appendf(nil, "//# sourceMappingURL=%s\n%s", demoSourceMapPath.String(), string(demoJS))
	jsHash := sha256.Sum256(demoJS)
	jsParams := map[string]string{"hash": hex.EncodeToString(jsHash[:])}
	demoJSPath, err = safehtml.TrustedResourceURLFormatFromConstant("/demo-%{hash}.js", jsParams)
	if err != nil {
		log.FatalContextf(ctx, "Failed to create JS path: %v", err)
	}

	var jsGzBuf bytes.Buffer
	gzw := gzip.NewWriter(&jsGzBuf)
	if _, err := gzw.Write(demoJS); err != nil {
		log.FatalContextf(ctx, "Failed to gzip demoJS: %v", err)
	}
	if err := gzw.Close(); err != nil {
		log.FatalContextf(ctx, "Failed to close gzip writer for demoJS: %v", err)
	}
	demoJSGz = jsGzBuf.Bytes()
}

// AppPage is the input to the app.html template.
type AppPage struct {
	SysGraphPath string
	DemoCSSPath  safehtml.TrustedResourceURL
	DemoJSPath   safehtml.TrustedResourceURL
	Error        string
}

func (s *SysGraphServer) serveIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		msg := fmt.Sprintf("404 not found: %q", r.URL.Path)
		http.Error(w, msg, http.StatusNotFound)
		return
	}
	s.serveApp(w, r)
}

func (s *SysGraphServer) serveApp(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	appPage := &AppPage{
		DemoCSSPath:  demoCSSPath,
		DemoJSPath:   demoJSPath,
		SysGraphPath: path,
	}

	resp := new(bytes.Buffer)
	if err := s.frontPageTmpl.ExecuteTemplate(resp, "app.html", appPage); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	writeResponse(w, r, http.StatusOK, resp.Bytes())
}

type sysGraphStore struct {
	mu         sync.Mutex
	diskGraphs map[string]sgtransform.SysGraph
}

// loadSysGraph loads the sysgraph at the given path and populates the Nodes map.
func (s *sysGraphStore) loadSysGraph(ctx context.Context, path string) error {
	dg, err := sgstorage.LoadSysGraph(ctx, path)
	if err != nil {
		return fmt.Errorf("failed to load sysgraph: %v", err)
	}
	if s.diskGraphs == nil {
		s.diskGraphs = make(map[string]sgtransform.SysGraph)
	}
	log.V(1).InfoContextf(ctx, "Loaded sysgraph from %v successfully.", path)
	s.diskGraphs[path] = dg
	return nil
}

func (s *sysGraphStore) SysGraph(ctx context.Context, path string) (sgtransform.SysGraph, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.diskGraphs[path]; !ok {
		if err := s.loadSysGraph(ctx, path); err != nil {
			return nil, err
		}
	}
	return s.diskGraphs[path], nil
}

// NewHTTPHandler returns an HTTP handler that serves the sysgraph at the given path.
func (s *SysGraphServer) serveSysGraph(w http.ResponseWriter, r *http.Request) {
	sgPath := r.URL.Query().Get("path")
	if sgPath == "" {
		http.Error(w, "path parameter is required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	path := strings.TrimSuffix(sgPath, "sysgraph.zip") + "sysgraph.json.gz"
	// In order to avoid decompressing precomputed gzips, we need `re` to be
	// an io.Reader of gzipped data. For the slow path, though, this is a bit
	// awkward since `compress/gzip` doesn't offer a compressing reader; only
	// a decompressing reader and a compressing writer. We use `io.Pipe` to
	// adapt the compressing writer to a reader, but `io.Pipe` is blocking on
	// both ends, so we need to run them in concurrent goroutines, hence the
	// errgroup.
	var re io.ReadCloser
	eg, egctx := errgroup.WithContext(ctx)
	re, err := os.Open(path)
	if err != nil {
		sg, err := s.graphStore.SysGraph(ctx, sgPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		in, out := io.Pipe()
		eg.Go(func() error {
			err := s.precomputeClient.SysGraphResponse(egctx, sgPath, sg, out)
			out.CloseWithError(err)
			return err
		})
		re = in
	}
	defer re.Close()
	w.Header().Set("Content-Type", "application/json")
	eg.Go(func() error {
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			_, err := io.Copy(w, re)
			return err
		}
		gre, err := gzip.NewReader(re)
		if err != nil {
			return err
		}
		_, err = io.Copy(w, gre)
		return err
	})
	if err := eg.Wait(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func writeResponse(w http.ResponseWriter, r *http.Request, status int, data []byte) error {
	if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.WriteHeader(status)
		_, err := w.Write(data)
		return err
	}
	w.Header().Set("Content-Encoding", "gzip")
	w.WriteHeader(status)
	gz, err := gzip.NewWriterLevel(w, 2)
	if err != nil {
		return err
	}
	if _, err := gz.Write(data); err != nil {
		return err
	}
	return gz.Close()
}

type precomputeClientInterface interface {
	SysGraphResponse(ctx context.Context, path string, sg sgtransform.SysGraph, w io.Writer) error
}

// SysGraphServer is a struct that has methods for serving sysgraph data.
type SysGraphServer struct {
	graphStore       sysGraphStore
	precomputeClient precomputeClientInterface
	frontPageTmpl    *template.Template
}

func serveStaticFile(w http.ResponseWriter, r *http.Request, content, contentGz []byte, contentType string) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000") // Cache for 1 year
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		w.Write(contentGz)
	} else {
		w.Write(content)
	}
}

func mustParseTemplates() *template.Template {
	return template.Must(template.ParseGlobFromTrustedSource(template.TrustedSourceFromConstant(templatesPathGlob)))
}

func main() {
	flag.Parse()
	ctx := context.Background()

	mustInitStaticFiles(ctx)
	frontPageTmpl := mustParseTemplates()

	precomputeClient, err := precompute.NewClient(ctx)
	if err != nil {
		log.ErrorContextf(ctx, "failed to create graph client: %v", err)
	}

	sg := &SysGraphServer{
		precomputeClient: precomputeClient,
		frontPageTmpl:    frontPageTmpl,
	}
	http.HandleFunc("/api/sysgraph/", sg.serveSysGraph)
	http.HandleFunc("/", sg.serveIndex)

	http.HandleFunc(demoCSSPath.String(), func(w http.ResponseWriter, r *http.Request) {
		serveStaticFile(w, r, demoCSS, demoCSSGz, "text/css")
	})
	http.HandleFunc(demoJSPath.String(), func(w http.ResponseWriter, r *http.Request) {
		serveStaticFile(w, r, demoJS, demoJSGz, "application/javascript")
	})
	http.HandleFunc(demoSourceMapPath.String(), func(w http.ResponseWriter, r *http.Request) {
		serveStaticFile(w, r, demoSourceMap, demoSourceMapGz, "application/json")
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Listening on port %s\n", port)
	log.ExitContext(ctx, http.ListenAndServe(fmt.Sprintf(":%s", port), nil))
}
