# CrashDojo — project page

**CrashDojo: Accident-Grounded World Models as Closed-Loop Safety Examiners for Autonomous Driving Planners**

Bowen Jing\*, Haoyun Tang\*, Ruiyang Hao, Chenchen Ge, Weitao Zhou, Haibao Yu†
\* equal contribution · † corresponding author

Live site: https://crashdojo.github.io

## What is on the page
- **Case lab** — archived closed-loop rollouts replayed in the browser: actor selection (seven-check record),
  the requested conflict (mechanism template, guided plans every 0.5 s) and the logged contact-pressure weight λ<sub>t</sub>.
- **Same request, four planners** — one cut-in request executed against Diffusion Planner, Flow Planner, IDM and PDM-Closed.
- **Main comparison and component study** — numbers from the paper's tables.
- **Plausibility check** — a fixed VLM screens each executed interaction for discontinuities.

## Structure
Static site, no build step.

```
index.html · style.css · app.js · caselab.js
data/cases/*.json     exported rollouts (boxes, plans, request, selection record, per-replan λ_t / q_t log)
data/vlm_cases.json   plausibility-check examples
media/                figures, teaser GIF, per-mechanism GIFs, affiliation logos
```

## Run locally
```
python3 -m http.server 8765
# open http://localhost:8765
```

## Notes
- Every number and trajectory comes from stored rollout records; only the hero animation is illustrative.
- Affiliation logos belong to their institutions.
