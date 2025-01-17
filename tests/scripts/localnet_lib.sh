#!this_is_supposed_to_be_sourced,_not_executed_directly

set -euxo pipefail

. deps/spl-token-swap/assignment.conf

CTRL_PID=JPCtrLreUqsEbdhtxZ8zpd8wBydKz4nuEjX5u9Eg5H8
MRGN_PID=JPMRGNgRk3w2pzBM1RLNBnpGxQYsFQ3yXKpuk4tTXVZ
POOL_PID=JPPooLEqRo3NCSx82EdE2VZY5vUaSsgskpZPBHNGVLZ
META_PID=JPMetawzxw7WyH3qHUVScYHWFBGhjwqDnM2R9qVbRLp
BOND_PID=JBond79m9K6HqYwngCjiJHb311GTXggo46kGcT2GijUc
ASM_PID=JPASMkxARMmbeahk37H8PAAP1UzPNC4wGhvwLnBsfHi
JTS_PID=JPTSApMSqCHBww7vDhpaSmzipTV3qPg6vxub4qneKoy
MGNSWAP_PID=JPMAa5dnWLFRvUsumawFcGhnwikqZziLLfqn9SLNXPN
SPLSWAP_PID=SwaPpA9LAaLfeLi3a68M4DjnLqgtticKg6CnyNwgAC8
ORCAv1_PID=DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1
ORCAv2_PID=9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP

CTRL_SO=target/deploy/jet_control.so
MRGN_SO=target/deploy/jet_margin.so
POOL_SO=target/deploy/jet_margin_pool.so
META_SO=target/deploy/jet_metadata.so
BOND_SO=target/deploy/jet_bonds.so
ASM_SO=target/deploy/jet_airspace.so
JTS_SO=target/deploy/jet_test_service.so
MGNSWAP_SO=target/deploy/jet_margin_swap.so
SPLSWAP_SO=$SPL_V20_FROM_CRATES
ORCAv1_SO=$ORCA_V1_MAINNET
ORCAv2_SO=$ORCA_V2_MAINNET

PROGRAM_FEATURES='testing'
TEST_FEATURES="${BATCH:-batch_all},localnet"

anchor-build() {
    anchor build $@ -- --features $PROGRAM_FEATURES
}

cargo-build() {
    RUST_BACKTRACE=1 cargo build \
        --features $TEST_FEATURES \
        --package hosted-tests
}

test() {
    RUST_BACKTRACE=1 with-validator cargo test \
        --features $TEST_FEATURES \
        --package hosted-tests \
        --test $@
}

run() {
    RUST_BACKTRACE=1 with-validator cargo run \
        --features $TEST_FEATURES \
        --package hosted-tests \
        --bin $@
}

start-validator() {
    solana-test-validator \
        --bpf-program $JTS_PID $JTS_SO \
        --bpf-program $CTRL_PID $CTRL_SO \
        --bpf-program $MRGN_PID $MRGN_SO \
        --bpf-program $POOL_PID $POOL_SO \
        --bpf-program $META_PID $META_SO \
        --bpf-program $BOND_PID $BOND_SO \
        --bpf-program $ASM_PID $ASM_SO \
        --bpf-program $MGNSWAP_PID $MGNSWAP_SO \
        --bpf-program $SPLSWAP_PID $SPLSWAP_SO \
        --bpf-program $ORCAv1_PID $ORCAv1_SO \
        --bpf-program $ORCAv2_PID $ORCAv2_SO \
        --quiet \
        $@
}

start-oracle() {
    cargo run --bin jet-oracle-mirror -- -s $SOLANA_MAINNET_RPC -tl &
}

resume-validator() {
    start-validator &

    spid=$!

    sleep ${VALIDATOR_STARTUP:-5}
    start-oracle

    wait $spid
}

start-new-validator() {
    start-validator -r &

    spid=$!

    sleep ${VALIDATOR_STARTUP:-5}

    cargo run --bin jetctl -- test init-env -ul --no-confirm localnet.toml
    cargo run --bin jetctl -- test generate-app-config -ul --no-confirm localnet.toml -o app/public/localnet.config.json

    start-oracle

    wait $spid
}

with-validator() {
    start-validator -r &

    spid=$!
    sleep ${VALIDATOR_STARTUP:-5}
    
    if [[ ${SOLANA_LOGS:-false} == true ]]; then
        solana -ul logs &
    fi

    cargo run --bin jetctl -- test init-env -ul --no-confirm localnet.toml
    cargo run --bin jetctl -- test generate-app-config -ul --no-confirm localnet.toml -o app/public/localnet.config.json

    $@
    
    kill $spid
    sleep 2
}

cleanup() {
    pkill -P $$ || true
    wait || true
}

trap_add() {
    trap_add_cmd=$1; shift || fatal "${FUNCNAME} usage error"
    for trap_add_name in "$@"; do
        trap -- "$(
            extract_trap_cmd() { printf '%s\n' "${3:-}"; }
            eval "extract_trap_cmd $(trap -p "${trap_add_name}")"
            printf '%s\n' "${trap_add_cmd}"
        )" "${trap_add_name}" \
            || fatal "unable to add to trap ${trap_add_name}"
    done
}

declare -f -t trap_add
trap_add 'cleanup' EXIT
