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
- [x] Update agents.md with project structure
- [x] Register agent metadata, such as version in the run json
- [x] Do not execute a run for a specific configuration (agent, input parameters, version) after the specified number of runs for this configuration was reached
- [x] provide a -force flag to override this

# Version 1.5

- [x] Update README.md to match the project functionality
- [x] While running a task, show a spinner with a progress/status information
- [x] Show time taken while running an agent
- [x] The health check for the gemini CLI succeeds although no GEMINI_API_KEY is set. It causes the benchmark execution to hang for a while and then existing without results.

# Version 1.6

- [x] Allow parallelization of the runs (can be disabled by configuration parameter)
- [x] The currently used model, used and remaining context, temperature, and other parameters that the agent uses should be written to the run.json.

- [x] Refactor the data model

The benchmark is defined in `bench.config.json` and consists of multiple variants that should be compared to each other.
For every variant the following settings can be configure:

- Name
- Agent to use
- Agent parameters (model, temperature, etc.)
- Task to run
- Additional files to be added to the benchmarking workspace (e.g. skills, mcp.json, ...)

# Version 1.6

- [x] Extend the bench.config.json fileformat to allow definition of variant defaults. Variants inherit these settings but can override them.

- [x] When running parallel tasks we should be able to see statistics, running time, token count etc. for each.

- [x] Remove the "agents" property from bench.config.json as each variant already defines the agent it wants to use.

# Version 1.7

- [x] Extend the bench.config.json so agent parameters can optionally be overridden there. Get rid of the ./agents directory and the corresponding "agentsDir" configuration
- [x] Extend the bench.config.json and allow execution of shell commands for each variant (also support variantDefaults for this)

# Version 1.8

- [ ] Migrate bench.config.json reading mechanism to YAML. Also convert the existing bench.config.json file to the new format
- [ ] Add a configuration mechanism that allows us to place files in the benchmark workspace. Either by copying an existing file or by including the file contents in the bench.config
- [ ] The prompt should also be configurable in the bench.config
