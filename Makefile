.DELETE_ON_ERROR:

GO_FILES=$(shell find . -name '*.go')
UI_SOURCES=$(shell find ui -name '*.ts' -not -path 'ui/node_modules/*')
UI_CONFIG=ui/package.json ui/vite.config.ts ui/tsconfig.json

.PHONY: all clean test test-go test-ui lint-ui analyze-ui format-ui generate check_tools

all: check_tools bin/bpf_extractor bin/sgmatcher bin/playground_server

ui/node_modules/.npminstalled: ui/package.json ui/package-lock.json check_tools
	cd ui && npm install && touch node_modules/.npminstalled

check_tools:
	@command -v protoc > /dev/null || (echo "ERROR: protoc not found in PATH. Please install protoc or adjust your PATH." && exit 1)
	@command -v npm > /dev/null || (echo "ERROR: npm not found in PATH. Please install npm or adjust your PATH." && exit 1)
	@command -v go > /dev/null || (echo "ERROR: go not found in PATH. Please install go or adjust your PATH." && exit 1)

clean:
	rm -f bin/* cmd/playground_server/embed/demo.css.gz
	rm -rf cmd/playground_server/embed/ui
	rm -rf examples/*/graph
	rm -rf ui/proto

test-go:
	go test ./...

test-ui: ui/node_modules/.npminstalled lint-ui analyze-ui
	cd ui && npm test

lint-ui: ui/node_modules/.npminstalled
	cd ui && npm run lint

analyze-ui: ui/node_modules/.npminstalled
	cd ui && npm run analyze

format-ui: ui/node_modules/.npminstalled
	cd ui && npm run format

test: test-go test-ui

generate:
	go generate ./proto/playground/

cmd/playground_server/embed/ui/playground_app.js: $(UI_SOURCES) $(UI_CONFIG) ui/node_modules/.npminstalled check_tools
	cd ui && npm run build

cmd/playground_server/embed/ui/playground_app.js.gz: cmd/playground_server/embed/ui/playground_app.js
	gzip -f -k $<

cmd/playground_server/embed/demo.css.gz: cmd/playground_server/embed/demo.css
	gzip -f -k $<

cmd/playground_server/embed/ui/playground_app.js.map.gz: cmd/playground_server/embed/ui/playground_app.js.map
	gzip -f -k $<

bin/bpf_extractor: $(GO_FILES)
	go build -o ./bin/bpf_extractor ./cmd/bpf_extractor/

bin/sgmatcher: $(GO_FILES)
	go build -o ./bin/sgmatcher ./cmd/sgmatcher/

bin/playground_server: $(GO_FILES) cmd/playground_server/embed/ui/playground_app.js cmd/playground_server/embed/ui/playground_app.js.gz cmd/playground_server/embed/ui/playground_app.js.map.gz cmd/playground_server/embed/demo.css.gz
	go build -o ./bin/playground_server ./cmd/playground_server/
