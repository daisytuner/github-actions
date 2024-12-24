import * as core from "@actions/core";
import * as github from "@actions/github";
import * as axios from "axios";
import * as yaml from "yaml";

async function run() {
  try {
    // Read inputs
    const baseImage = core.getInput("base_image");
    const partition = core.getInput("partition");
    const timeout = parseInt(core.getInput("timeout")) * 1000 * 60; // convert minutes to ms
    const build = core.getInput("build");
    const stage = core.getInput("stage");
    const run = yaml.parse(core.getInput("run"));
    if (!baseImage || !partition || !build || !stage || !run) {
      throw new Error("Missing required inputs.");
    }

    for (const [name, command] of Object.entries(run)) {
      core.info(`Collected run command for benchmark ${name}: ${command}`);
    }

    const repoUrl = github.context.payload.repository?.git_url;
    const repoName = github.context.payload.repository?.name;
    const repoOwner = github.context.payload.repository!.owner.login;
    const isPrivate = github.context.payload.repository?.private;
    if (!repoUrl || !repoName || !repoOwner || isPrivate === undefined) {
      throw new Error("Missing repository information in the github context.");
    }

    const commitSha = github.context.sha;
    const actor = github.context.actor;
    const runNumber = github.context.runNumber;
    if (!commitSha || !actor || !runNumber) {
      throw new Error("Missing PR information in the github context");
    }

    // Construct payload
    const payload = {
      repo_url: repoUrl,
      repo_name: repoName,
      repo_owner: repoOwner,
      is_private: isPrivate,
      commit_sha: commitSha,
      actor: actor,
      run_number: runNumber,
      base_image: baseImage,
      partition: partition,
      build: build,
      stage: stage,
      run: run,
      timeout: timeout,
    };

    // Post to Firebase function
    core.info("Submitting job to the backend...");
    const response = await axios.default.post("https://createjob-bhqsvyw3sa-uc.a.run.app", payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) {
      core.setFailed(`Failed to submit job. Status: ${response.status}`);
      return;
    }
  
    const jobId = response.data.jobId;
    core.info(`Job posted successfully! Job ID: ${jobId}`);
  } catch (error: any) {
    core.error(`An error occurred: ${error.message}`);
    core.setFailed(error.message);
  }
}

run();
