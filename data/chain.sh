#!/bin/bash
D="/Users/mihaiposea/Weave Takehome/data"
while pgrep -f "pull.sh" > /dev/null; do sleep 10; done
echo "pass1 finished, starting pass2 $(date)" >> "$D/files.log"
"$D/pull_files.sh"
