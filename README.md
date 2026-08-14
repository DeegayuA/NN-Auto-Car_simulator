# NN-Auto-Car — Neuroevolutionary Autonomous Driving Simulator

Capstone project, CS5998 (IN25-S3-CS5998) — MSc Data Science & Artificial Intelligence,
Department of Computer Science and Engineering, Faculty of Engineering, University of Moratuwa.

**Deeghayu Suwahas Adhikari — 258722D**

A browser-based 2D autonomous driving simulator built entirely from first principles: a
hand-written multilayer perceptron, a hand-written genetic algorithm, a custom kinematic
engine and a ray-cast range sensor, with **no machine-learning framework and no game
engine**. The world is a real road topology imported from OpenStreetMap.

---

## Final report

The final report is provided in two layouts. **The content, figures and numbers are
identical** — both are generated from the same source document.

| Report | Layout | Pages |
|---|---|---|
| [**final_report_new_ieee.pdf**](reports/final_report_new_ieee.pdf) | IEEE conference, two-column | 29 |
| [**final_report_new_normal.pdf**](reports/final_report_new_normal.pdf) | Plain single-column technical report | 30 |

The LaTeX source for the IEEE layout is [`temp_report/final_report.tex`](temp_report/final_report.tex)
(needs `IEEEtran.cls` and the figures in `temp_report/figures/`).

### Headline findings

- The objective function committed at the technical checkpoint was **degenerate**: the
  route-progress score returned zero at every location in the world, producing **1 distinct
  fitness value across a population of 60** and no improvement over 30 generations — while
  the running system showed every outward appearance of learning.
- Root cause: a loader/consumer contract mismatch. `NodeGraph.load` rebuilt nodes via
  `new GeoPoint(x, y)`, dropping the OSM `id`; `RouteDiscovery` keyed its maps on that `id`.
  All 446 nodes collapsed onto a single entry. Repaired in `utils/nodeGraph.js` and
  `utils/pathfinder.js`.
- After the repair, selection pressure is restored and learning is measurable. Tournament
  selection with uniform crossover cuts seed-to-seed variance **3.3×** and improves held-out
  route progress **3.1×** over the shipped clone-and-mutate operator.
- Additional network depth **hurts** — contradicting the direction proposed at the checkpoint.
- A tuned 3-parameter reactive heuristic still **outperforms** the evolved 246-parameter
  network on held-out poses by 1.8×, and a controller that can see the map collides in 85% of
  episodes — bounding what any policy on this vehicle model can achieve.

---

## Running the simulator

No build step and no dependencies. Serve the repository root over HTTP and open `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

## Reproducing the results

Node.js only — no third-party packages.

```bash
# 1. Descriptive statistics of the ingested world
node experiments/datasetStats.js

# 2. Verify the harness is deterministic and the spatial index is behaviour-preserving
node experiments/verifyHarness.js

# 3. Full experimental protocol (E1-E5)  — ~27 minutes, CPU only
node experiments/runExperiments.js

# 4. Render every figure from the results
node experiments/makeFigures.js

# 5. Rebuild both report PDFs into reports/
node temp_report/build.js
```

`--smoke` runs a reduced configuration in under a minute; `--only=E1,E3` restricts execution
to named experiments.

## Repository layout

| Path | Contents |
|---|---|
| `index.html`, `main.js`, `core/`, `simulation/`, `ui/`, `utils/` | The interactive simulator |
| `simulation/simulationData.js` | Committed OpenStreetMap extract (6.1 MB) |
| `experiments/harness/` | Headless evaluation harness (loader, seeded RNG, spatial index, controllers, GA, statistics) |
| `experiments/results/` | All raw results as JSON |
| `experiments/figures/`, `experiments/screenshots/` | Generated figures and application screenshots |
| `temp_report/` | Report source, renderers, HTML and LaTeX output |
| `reports/` | **The two final report PDFs** |
| `Docs/` | Assignment brief and earlier milestone submissions |

Every numeric value in the report is read programmatically from `experiments/results/*.json`
at build time; none is transcribed by hand.
