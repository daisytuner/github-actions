import * as core from "@actions/core";
import * as axios from "axios";

async function run() {
  try {
    // Read inputs
    const repoName = core.getInput("repo_name");
    const commitSha = core.getInput("commit_sha");
    const prNumber = core.getInput("pr_number");
    const baseImage = core.getInput("base_image");
    const script = core.getInput("script");
    const timeout = parseInt(core.getInput("timeout"));
    const benchmarks = JSON.parse(core.getInput("benchmarks"));

    // Construct payload
    const payload = {
      repo_name: repoName,
      commit_sha: commitSha,
      pr_number: prNumber,
      base_image: baseImage,
      script: script,
      benchmarks: benchmarks
    };

    // Post to Firebase function
    core.info("Submitting job");
    const response = await axios.default.post("https://create-bhqsvyw3sa-uc.a.run.app", payload, {
      headers: { "Content-Type": "application/json" },
    });
    if (response.status === 200) {
      core.info("Job posted successfully!");
    } else {
      core.setFailed(`Failed to post job. Status: ${response.status}`);
    }
    const jobId = response.data.job_id;

    const endTime = Date.now() + timeout;

    // Poll job status
    let jobCompleted = false;
    while (!jobCompleted) {
      if (Date.now() > endTime) {
        throw new Error("Job polling timed out.");
      }

      core.info(`Checking job status for ID: ${jobId}`);
      const response = await axios.default.post("https://status-bhqsvyw3sa-uc.a.run.app", {jobId: jobId}, {
        headers: { "Content-Type": "application/json" },
      });
      const job = response.data;

      core.info(`Current job status: ${job.status}`);
      if (job.log) {
        core.info(`Streaming log:\n${job.log}`);
      }

      if (job.status === "completed" || job.status === "failed") {
        core.info(`Job ${jobId} has completed with status: ${job.status}`);
        if (job.status === "failed") {
          core.setFailed(`Job ${jobId} failed.`);
        }
        jobCompleted = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  } catch (error: any) {
    core.setFailed(`Error posting job: ${error.message}`);
  }
}

run();
