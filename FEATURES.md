# Version 1.1

- [x] Add the "-all" option to the `report` command
- [x] Implement a "scoreboard" command to output an overview of all runs
- [x] Extend the judge to additionaly give a short textual summary of the results
- [x] Place the resulting files in the runs directory so a human can have a look

# Version 1.2

- [x] Add agent logfiles to run directory for better diagnostics
- [x] The defaultRuns config does not seem to make a difference
- [x] Instead of defining all agents in a config file we should put them in separate files
- [x] Add a way to approximate costs per agent
- [x] This project should be named "loopscore"

# Version 1.3

- [x] The linecount should only include code
- [x] Instead of always using the bench.config.js
- [x] Only use the agents referred to in the "agents" property of "bench.config.json"
- [x] Every agent should provide a healthcheck function that makes sure the agent is ready to go (installed, authenticated). This function should be called for all referenced agents before starting a benchmark run
- [x] Instead of using "bench.config.json" the benchmark configuration should be provided by a parameter
- [x] Add gemini CLI as an agent
- [x] Add claude CLI as an agent

# Version 1.4

- [x] Add option to output the scoreboard as markdown
- [x] Migrate to chalk 5
- [ ] Update agents.md with project structure
- [ ] Register agent metadata, such as version in the run json
- [ ] Do not execute a run for a specific configuration (agent, input parameters, version) after the specified number of runs for this configuration was reached
- [ ] provide a -force flag to override this
