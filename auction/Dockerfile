# syntax=docker/dockerfile:1
# Orbid stateless prover (RISC0 Groth16).
#
# Local Groth16 proving shells out to `docker run risczero/risc0-groth16-prover`
# (risc0-groth16/src/prove/docker.rs), honoring $RISC0_WORK_DIR for the bind
# mount.

###############################################################################
# Builder: host-side Rust + the rzup-managed RISC0 toolchain, which the
# auction-methods build script uses to compile the zkVM guest into an ELF.
###############################################################################
FROM rust:1.91-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl git pkg-config libssl-dev build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# rzup + the exact component versions the host built with (avoids a drifting
# `rzup install` pulling a guest toolchain incompatible with risc0-build 3.0.5).
RUN curl -L https://risczero.com/install | bash
ENV PATH="/root/.risc0/bin:${PATH}"
RUN rzup install rust 1.94.1 \
 && rzup install cpp 2024.1.5 \
 && rzup install r0vm 3.0.5 \
 && rzup install cargo-risczero 3.0.5

WORKDIR /app
COPY . .
# Builds auction-server and, via build.rs (embed_methods), the guest ELF baked
# into the binary.
RUN cargo build -p auction-server --release

# Stage the r0vm STARK prover binary at a fixed path for the runtime image
# (rzup nests it under a versioned extensions/ dir).
RUN find /root/.risc0 -name r0vm -type f -exec cp {} /usr/local/bin/r0vm \;

###############################################################################
# Runtime: the server + r0vm (STARK prover) + docker CLI (Groth16 wrap). Same
# Debian bookworm glibc as the builder, so the dynamically-linked binary runs.
###############################################################################
FROM debian:bookworm-slim

# r0vm links against libstdc++/libgcc; curl is used to fetch the static docker CLI.
ARG DOCKER_CLI_VERSION=27.5.1
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates libstdc++6 libgcc-s1 \
    && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
        | tar xz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && rm -rf /tmp/docker /var/lib/apt/lists/*

# Prover binaries from the builder: the server (with the guest ELF baked in) and
# the r0vm STARK prover it spawns. The final Groth16 wrap shells out to
# `docker run risczero/risc0-groth16-prover`
COPY --from=builder /app/target/release/auction-server /usr/local/bin/auction-server
COPY --from=builder /usr/local/bin/r0vm /usr/local/bin/r0vm
ENV RISC0_SERVER_PATH=/usr/local/bin/r0vm

ENV PORT=8000
EXPOSE 8000
ENTRYPOINT ["auction-server"]
