# syntax=docker/dockerfile:1
# General RISC0 prover (Bonsai-style). The guest ELF arrives over the wire, so
# this image does NOT compile any guest - no rzup / guest toolchain needed.
#
# Local Groth16 proving shells out to `docker run risczero/risc0-groth16-prover`
# (risc0-groth16/src/prove/docker.rs), honoring $RISC0_WORK_DIR for the bind
# mount.

###############################################################################
# Builder: plain stable Rust. Compiles only the host-side prover server.
###############################################################################
FROM rust:1.91-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev curl git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN cargo build -p auction-server --release

# Stage the r0vm STARK prover binary (pulled in by risc0-zkvm at build time, or
# fetched here) at a fixed path for the runtime image.
RUN set -eux; \
    found="$(find / -name r0vm -type f -executable 2>/dev/null | head -1 || true)"; \
    if [ -z "$found" ]; then \
        curl -L https://risczero.com/install | bash; \
        export PATH="/root/.risc0/bin:$PATH"; \
        rzup install r0vm 3.0.5; \
        found="$(find /root/.risc0 -name r0vm -type f -executable | head -1)"; \
    fi; \
    cp "$found" /usr/local/bin/r0vm

###############################################################################
# Runtime: the server + r0vm (STARK prover) + docker CLI (Groth16 wrap). Same
# Debian bookworm glibc as the builder, so the dynamically-linked binary runs.
###############################################################################
FROM debian:bookworm-slim

# r0vm links against libstdc++/libgcc; curl fetches the static docker CLI.
ARG DOCKER_CLI_VERSION=27.5.1
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates libstdc++6 libgcc-s1 \
    && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
        | tar xz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && rm -rf /tmp/docker /var/lib/apt/lists/*

COPY --from=builder /app/target/release/auction-server /usr/local/bin/auction-server
COPY --from=builder /usr/local/bin/r0vm /usr/local/bin/r0vm
ENV RISC0_SERVER_PATH=/usr/local/bin/r0vm

ENV PORT=8000
EXPOSE 8000
ENTRYPOINT ["auction-server"]
