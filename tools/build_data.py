"""Turn OpenWorm's CElegansNeuronTables.xls into src/connectome.json.

Source: https://github.com/openworm/ConnectomeToolbox (cect/data), which
packages the Varshney et al. 2011 hermaphrodite wiring with transmitter
assignments. Run: python3 tools/build_data.py (needs `pip install xlrd`).
"""
import collections
import json
import pathlib
import re

import xlrd

HERE = pathlib.Path(__file__).parent
book = xlrd.open_workbook(HERE / "CElegansNeuronTables.xls")


def rows(name):
    sheet = book.sheet_by_name(name)
    return [sheet.row_values(r) for r in range(1, sheet.nrows)]


conn = rows("Connectome")
to_muscle = rows("NeuronsToMuscle")
sensory = {r[0]: r[6].strip().lower() for r in rows("Sensory")}

names = sorted({r[0] for r in conn} | {r[1] for r in conn} | {r[0] for r in to_muscle})
index = {n: i for i, n in enumerate(names)}

transmitter = {}
for pre, _post, kind, _n, nt in conn:
    if kind == "Send":
        transmitter[pre] = nt
for neuron, _m, _n, nt in to_muscle:
    transmitter.setdefault(neuron, nt)

PHARYNX = re.compile(r"^(I[1-6][LR]?|M[1-5][LR]?|MC[LR]|MI|NSM[LR])$")
COMMAND = re.compile(r"^(AVA|AVB|AVD|AVE|PVC)[LR]$")
motor_names = {r[0] for r in to_muscle}


def group(n):
    if PHARYNX.match(n):
        return "pharynx"
    if COMMAND.match(n):
        return "command"
    if n in sensory:
        return "sensory"
    if n in motor_names:
        return "motor"
    return "inter"


neurons = [
    {"n": n, "g": group(n), "nt": transmitter.get(n, ""), "f": sensory.get(n, "")}
    for n in names
]

chem, gap = [], {}
for pre, post, kind, count, _nt in conn:
    a, b = index[pre], index[post]
    if kind == "Send":
        chem.append([a, b, int(count)])
    elif kind == "GapJunction":
        key = (min(a, b), max(a, b))
        gap[key] = max(gap.get(key, 0), int(count))

muscles = sorted({r[1] for r in to_muscle if re.match(r"^M[DV][LR]\d\d$", r[1])})
mindex = {m: i for i, m in enumerate(muscles)}
nmj = [[index[n], mindex[m], int(c)] for n, m, c, _ in to_muscle if m in mindex]

out = {
    "source": "OpenWorm CElegansNeuronTables (Varshney et al. 2011)",
    "neurons": neurons,
    "chem": chem,
    "gap": [[a, b, w] for (a, b), w in sorted(gap.items())],
    "muscles": muscles,
    "nmj": nmj,
}
(HERE.parent / "src" / "connectome.json").write_text(json.dumps(out, separators=(",", ":")))
print(len(neurons), "neurons,", len(chem), "chemical,", len(gap), "gap,", len(nmj), "nmj,", len(muscles), "muscles")
print(collections.Counter(x["g"] for x in neurons))
