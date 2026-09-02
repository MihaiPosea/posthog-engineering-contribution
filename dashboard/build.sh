#!/bin/bash
# Regenerate the dashboard's data payload.
#   ./build.sh                      -> builds from ../dashboard_data.mock.json
#   ./build.sh ../dashboard_data.json  -> builds from the real file when it lands
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="${1:-$DIR/../dashboard_data.mock.json}"
python3 - "$SRC" "$DIR" <<'PY'
import json, os, sys
src, dest = sys.argv[1], sys.argv[2]
d = json.load(open(src))
with open(os.path.join(dest, 'dashboard_data.json'), 'w') as f:
    json.dump(d, f, separators=(',', ':'))
with open(os.path.join(dest, 'data.js'), 'w') as f:
    f.write('window.__DASHBOARD_DATA__=' + json.dumps(d, separators=(',', ':')) + ';\n')
print('built %s -> %d engineers, %d dimensions, %d presets%s'
      % (os.path.basename(src), len(d['engineers']), len(d['dimensions']),
         len(d['presets']), '  [MOCK]' if d['meta'].get('MOCK') else ''))
PY
