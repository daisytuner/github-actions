import * as core from "@actions/core";
import * as github from "@actions/github";
import * as axios from "axios";

async function run() {
  try {
    // Read inputs
    const baseImage = core.getInput("base_image");
    const script = core.getInput("script");
    const timeout = parseInt(core.getInput("timeout")) * 1000 * 60; // convert minutes to ms
    const benchmarks = JSON.parse(core.getInput("benchmarks"));

    const repoUrl = github.context.payload.repository?.git_url;
    const repoName = github.context.payload.repository?.name;
    const repoOwner = github.context.payload.repository!.owner.login;
    const isPrivate = github.context.payload.repository?.private;
    if (!repoUrl || !repoName || !repoOwner || isPrivate === undefined) {
      throw new Error("Missing repository information in the github context.");
    }

    const commitSha = github.context.sha;
    const runNumber = github.context.runNumber;
    const actor = github.context.actor;
    if (!commitSha || !actor) {
      throw new Error("Missing PR information in the github context");
    }

    // Construct payload
    const payload = {
      repo_url: repoUrl,
      repo_name: repoName,
      repo_owner: repoOwner,
      is_private: isPrivate,
      commit_sha: commitSha,
      run_number: runNumber,
      actor: actor,
      base_image: baseImage,
      script: script,
      benchmarks: benchmarks
    };

    // Post to Firebase function
    core.info("Submitting job to the backend...");
    const response = await axios.default.post("https://create-bhqsvyw3sa-uc.a.run.app", payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) {
      core.setFailed(`Failed to submit job. Status: ${response.status}`);
      return;
    }
  
    const jobId = response.data.jobId;
    core.info(`Job posted successfully! Job ID: ${jobId}`);

    // Poll job status
    core.info(`Waiting for a runner to pickup the job...`);
    const endTime = Date.now() + timeout;
    let status = "pending";
    let lastLogLength = 0;
    while (status !== "completed" && status !== "failed") {
      if (Date.now() > endTime) {
        throw new Error(`Action timed out after ${timeout / 1000 } seconds.`);
      }

      const statusResponse = await axios.default.post(
        "https://status-bhqsvyw3sa-uc.a.run.app",
        { jobId },
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      if (statusResponse.status !== 200) {
        throw new Error(`Failed to fetch job status. Status: ${statusResponse.status}`);
      }

      const job = statusResponse.data;
      if (status === "pending" && job.status !== "pending") {
        core.info(`Runner has picked up the job!`);
        status = job.status;
      }

      // Print new log output
      if (job.log) {
        const newLog = job.log.slice(lastLogLength); // Get only the new part of the log
        if (newLog) {
          core.info(`${newLog}`);
        }
        lastLogLength = job.log.length;
      }

      if (job.status === "completed" || job.status === "failed") {
        core.info(`Job ${jobId} has completed with status: ${job.status}`);
        if (job.status === "failed") {
          core.setFailed(`Job ${jobId} failed.`);
        }
        status = job.status;
      } else {
        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1 second
      }
    }
  } catch (error: any) {
    core.error(`An error occurred: ${error.message}`);
    core.setFailed(error.message);
  }
}

run();
