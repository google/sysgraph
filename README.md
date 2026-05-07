# Sysgraph Playground

Sysgraph Playground is an experimental security forensics tool to visualize and
investigate build behavior. It provides a browser-based UI for viewing build
recordings represented as OS system calls (process executions, file IO, and
pipes).

## Quick Start

To build and run the project, you will need **Go**, **Node.js**, and the
**Protocol Buffer Compiler (`protoc`)** installed on your system.

1. Build and start the playground server:

```bash
make bin/playground_server
./bin/playground_server
```

2. Visit `localhost:8080?path=examples/built/gcc.zip` in your browser.

To compile the complete tool suite (including BPF extractors and graph
matchers), run `make`.

## Generating Custom Recordings (Linux Only)

To record your own builds and generate new sysgraphs, you will need a Linux
environment with root access and `bpftrace` installed.

There are example builds under the `examples` folder. Use the
`./build_example.sh` script to build them and produce sysgraphs:

```bash
./build_example.sh gcc
make bin/sgmatcher
./bin/sgmatcher -sg=examples/gcc/graph
```

The `./build_example.sh` script runs the build under a trace and packages the
resulting syscall logs.

## Developing

### Testing

```bash
# Run all tests (both Go and UI)
make test

# Run Go tests only
make test-go

# Run UI tests only
make test-ui
```

### Modifying Protobufs

If you modify the `.proto` schemas, you will need to regenerate the Go code.
Ensure you have the Go protocol buffers plugin installed:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
export PATH="$PATH:$(go env GOPATH)/bin"
make generate
```

The TypeScript frontend generates its own schemas automatically during build.

## Contributing

We'd love to accept your patches and contributions! Please see our
[`CONTRIBUTING.md`](CONTRIBUTING.md) for details on how to help, including
signing the Contributor License Agreement (CLA) and our GitHub pull request
process.

Please also review our [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) to understand
our community standards.

## License

You are free to copy, modify, and distribute `sysgraph` under the terms of the
Apache License 2.0. See the [`LICENSE`](LICENSE) file for details.

## Disclaimer

This is not an officially supported Google product. This project is not
eligible for the [Google Open Source Software Vulnerability Rewards
Program](https://bughunters.google.com/open-source-security).

This project is intended for demonstration purposes only. It is not
intended for use in a production environment.
