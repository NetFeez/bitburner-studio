#!/bin/bash

set -eo pipefail

OUT_DIR="dist";
LOG_FILE="build.log";

# Cleaning old dist
if rm -rf "$OUT_DIR" 2>/dev/null; then
    echo -e "\x1b[32mOld dist removed\x1b[0m";
else
    echo -e "\x1b[33mNo old dist to remove\x1b[0m";
fi
# Building
echo -e "\x1b[34mBuilding...\x1b[0m";
if tsc --project tsconfig.json --pretty> "$LOG_FILE"; then
    echo -e "\x1b[32mBuild successful\x1b[0m";
    rm "$LOG_FILE";
else
    echo -e "\x1b[31mBuild failed. See $LOG_FILE for details.\x1b[0m";
    cat "$LOG_FILE";
    exit 1;
fi