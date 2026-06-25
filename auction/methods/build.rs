use std::collections::HashMap;

use risc0_build::{embed_methods_with_options, DockerOptionsBuilder, GuestOptionsBuilder};

/// Build the guest with RISC0's containerized reproducible build so the image id
/// is deterministic across machines (same source -> same id, independently
/// verifiable). `root_dir` is the auction workspace root (this build script runs
/// in `methods/`), which holds the guest crate, `auction-core`, and the risc0
/// `[patch.crates-io]` pins the guest needs.
fn main() {
    // r0.1.91.1 ships rustc >= 1.91; the default (r0.1.88.0) is too old for the
    // workspace lockfile (alloy's `ruint` requires rustc 1.90), even though the
    // guest itself never uses those crates.
    let docker = DockerOptionsBuilder::default()
        .root_dir("..")
        .docker_container_tag("r0.1.91.1")
        .build()
        .expect("DockerOptions builder failed");
    let guest_opts = GuestOptionsBuilder::default()
        .use_docker(docker)
        .build()
        .expect("GuestOptions builder failed");
    embed_methods_with_options(HashMap::from([("auction-guest", guest_opts)]));
}
