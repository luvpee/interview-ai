require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { generateInterviewReport, checkGrounding, interviewReportSchema } = require("../src/services/ai.service");

const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Target missing skills in each fixture
const TARGET_GAPS = {
    "pair-1.json": ["accessibility", "wcag"],
    "pair-2.json": ["queue", "kafka", "rabbitmq"],
    "pair-3.json": ["testing", "spark", "a/b"],
    "pair-4.json": ["prometheus", "grafana", "kubernetes", "k8s"],
    "pair-5.json": ["user research", "a/b test", "experimentation"]
};

async function runBenchmarkSuite() {
    // Connect to MongoDB (required by generationLogModel inside ai.service)
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    console.log("\n========================================================");
    console.log("RUNNING BENCHMARKS 2 & 4: Latency, Recall & Score Stability");
    console.log("========================================================");

    const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith(".json")).sort();
    const generationLatencies = [];
    const groundingLatencies = [];
    const fixtureResults = [];

    // Minimal userId for the generation log (no real user required for benchmarking)
    const benchmarkUserId = new mongoose.Types.ObjectId();

    for (const file of files) {
        const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8"));
        const targets = TARGET_GAPS[file] || [];

        console.log(`\nEvaluating Fixture: ${file}...`);

        // --- Generation phase (uses production withRetry + fallback internally) ---
        const genStart = Date.now();
        const report = await generateInterviewReport({
            resume: fixture.resume,
            selfDescription: "",
            jobDescription: fixture.jobDescription,
            userId: benchmarkUserId
        });
        const genDuration = Date.now() - genStart;
        generationLatencies.push(genDuration);

        // --- Grounding phase (uses production checkGrounding) ---
        const groundStart = Date.now();
        let groundingResult;
        try {
            groundingResult = await checkGrounding({
                jobDescription: fixture.jobDescription,
                resume: fixture.resume,
                report
            });
        } catch (err) {
            groundingResult = null;
        }
        const groundDuration = Date.now() - groundStart;
        groundingLatencies.push(groundDuration);

        // --- Recall check ---
        const generatedGaps = report.skillGaps.map(g => g.skill.toLowerCase()).join(" ");
        const caughtTarget = targets.some(t => generatedGaps.includes(t));

        console.log(`  Generation: ${(genDuration / 1000).toFixed(2)}s | Grounding: ${(groundDuration / 1000).toFixed(2)}s | Match Score: ${report.matchScore}%`);
        console.log(`  Gaps Found: ${report.skillGaps.map(g => g.skill).join(", ")}`);
        console.log(`  Target Recall: ${caughtTarget ? "✓ CAUGHT" : "✕ MISSED"}`);

        fixtureResults.push({
            Fixture: file,
            Generation: `${(genDuration / 1000).toFixed(2)}s`,
            Grounding: groundingResult ? `${(groundDuration / 1000).toFixed(2)}s` : "error",
            MatchScore: `${report.matchScore}%`,
            TargetGap: targets.join("/"),
            Recall: caughtTarget ? "PASS (100%)" : "FAIL"
        });
    }

    // Calculate Latency Percentiles (p50 / p95)
    const sorted = [...generationLatencies].sort((a, b) => a - b);
    const p50 = (sorted[Math.floor(sorted.length * 0.5)] / 1000).toFixed(2);
    const p95 = ((sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]) / 1000).toFixed(2);
    const avgGrounding = (groundingLatencies.reduce((a, b) => a + b, 0) / groundingLatencies.length / 1000).toFixed(2);
    const p50e2e = (parseFloat(p50) + parseFloat(avgGrounding)).toFixed(2);

    console.log("\n========================================================");
    console.log("RESULTS: BENCHMARK 4 (SKILL-GAP RECALL PER FIXTURE)");
    console.log("========================================================");
    console.table(fixtureResults);

    console.log("\n========================================================");
    console.log("RESULTS: BENCHMARK 2 (LATENCY METRICS)");
    console.log("========================================================");
    console.log(`- Sample Size: ${generationLatencies.length} fixture runs`);
    console.log(`- Generation p50 Latency: ${p50}s`);
    console.log(`- Generation p95 Latency: ${p95}s`);
    console.log(`- Average Grounding Critic Latency: ${avgGrounding}s`); // TODO: verify — measured live
    console.log(`- End-to-End Pipeline (Generation + Grounding): p50 ~${p50e2e}s`);

    await mongoose.disconnect();
}

runBenchmarkSuite().catch(err => {
    console.error("Benchmark error:", err);
    process.exit(1);
});
